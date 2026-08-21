/*
 * Extrato do Mercado Pago pela API — o que substitui o CSV baixado à mão.
 *
 * A API de pagamentos (`/v1/payments/search`) resolve só metade do problema:
 * traz o valor bruto e não enxerga saque, Pix enviado nem transferência para
 * o cofrinho. O "release report" é o extrato de verdade — as mesmas linhas
 * que aparecem no painel, com líquido, tarifa e saldo corrente.
 *
 * Ele não responde na hora: o pedido entra numa fila e o arquivo aparece
 * alguns minutos depois. Por isso quem chama pede primeiro (`pedirRelatorio`)
 * e busca depois (`relatorioPronto`), em execuções diferentes do cron — não
 * adianta ficar esperando dentro de uma requisição de 60 segundos.
 *
 * Sem imports de propósito: este módulo é usado tanto pelo Next quanto pelos
 * scripts em Node, que não resolvem o atalho "@/".
 */

const BASE = "https://api.mercadopago.com/v1/account/release_report";

export type PedidoRelatorio = {
  id: number;
  begin_date: string;
  end_date: string;
};

export type ArquivoRelatorio = {
  id: number;
  file_name: string;
  begin_date: string;
  end_date: string;
  status: string;
};

/** Uma linha do extrato, já normalizada para o formato da tesouraria. */
export type MovimentoExtrato = {
  /** SOURCE_ID — casa com mp_payment_id das transações vindas da API. */
  id: string;
  ocorridoEm: string;
  descricao: string;
  /** Positivo entrou, negativo saiu. Já líquido de tarifas. */
  liquido: number;
  /** O que foi cobrado da pessoa, antes das tarifas. */
  bruto: number;
  /** Tarifa do Mercado Pago mais impostos, sempre positiva. */
  tarifa: number;
  /** Saldo da conta depois deste movimento — serve para conferência. */
  saldo: number;
  metodo: string | null;
  unidade: string | null;
};

async function chamar(caminho: string, token: string, init?: RequestInit) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`release_report ${caminho} respondeu ${resposta.status}: ${corpo.slice(0, 200)}`);
  }

  return resposta;
}

/*
 * A janela como o Mercado Pago a entende: dias inteiros no fuso de Brasília.
 *
 * Duas armadilhas moram aqui, e as duas custaram caro.
 *
 * A primeira é o formato: `toISOString()` produz milissegundos, e a API recusa
 * respondendo "Must specify begin_date parameter" — apontando para o campo
 * faltando em vez do formato.
 *
 * A segunda é o arredondamento. Pedindo de 06/08 às 17:45 até 21/08 às 17:45,
 * o relatório volta cobrindo de 06/08 00:00 a 21/08 23:59, e é essa janela
 * arredondada que aparece na listagem. Comparar o que pedimos com o que
 * voltou, instante a instante, nunca casa — e o arquivo pronto fica ali sem
 * ninguém reconhecer.
 *
 * Pedindo já arredondado, o que sai é igual ao que volta.
 */
export function janelaDeDias(
  inicio: Date,
  fim: Date,
): { begin_date: string; end_date: string } {
  // Meia-noite em Brasília (UTC-3) é 03:00 em UTC.
  const diaEmBrasilia = (d: Date) =>
    new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);

  const primeiro = diaEmBrasilia(inicio);
  const seguinteAoUltimo = new Date(
    new Date(`${diaEmBrasilia(fim)}T12:00:00Z`).getTime() + 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  return {
    begin_date: `${primeiro}T03:00:00Z`,
    end_date: `${seguinteAoUltimo}T02:59:59Z`,
  };
}

/** Coloca um período na fila de geração. Devolve o id para buscar depois. */
export async function pedirRelatorio(
  token: string,
  inicio: Date,
  fim: Date,
): Promise<PedidoRelatorio> {
  const janela = janelaDeDias(inicio, fim);

  const resposta = await chamar("", token, {
    method: "POST",
    body: JSON.stringify({
      ...janela,
      // Sem isto o pedido nasce invisível e demora muito mais a sair da fila.
      notify: true,
    }),
  });

  return (await resposta.json()) as PedidoRelatorio;
}

/** Arquivos já gerados e disponíveis para download. */
export async function listarRelatorios(token: string): Promise<ArquivoRelatorio[]> {
  const resposta = await chamar("/list", token);
  const lista = (await resposta.json()) as ArquivoRelatorio[];
  return Array.isArray(lista) ? lista : [];
}

/**
 * Devolve o arquivo de um período, ou null enquanto ele ainda estiver na fila.
 *
 * O id que o POST devolve é do pedido; o id que a listagem traz é do arquivo.
 * São numerações diferentes, então o que casa os dois é a janela de datas —
 * ela volta na listagem exatamente como foi enviada.
 */
export async function relatorioPronto(
  token: string,
  inicio: string | Date,
  fim: string | Date,
  ignorar: ReadonlySet<string> = new Set(),
): Promise<ArquivoRelatorio | null> {
  const instante = (v: string | Date) => new Date(v).getTime();
  const lista = await listarRelatorios(token);

  return (
    lista.find(
      (a) =>
        !ignorar.has(a.file_name) &&
        instante(a.begin_date) === instante(inicio) &&
        instante(a.end_date) === instante(fim),
    ) ?? null
  );
}

export async function baixarRelatorio(token: string, nomeDoArquivo: string): Promise<string> {
  const resposta = await chamar(`/${nomeDoArquivo}`, token);
  return await resposta.text();
}

function numero(bruto: string | undefined): number {
  if (!bruto) return 0;
  // O relatório sai com ponto decimal; a vírgula aparece se a conta estiver
  // configurada em pt-BR. Tratar os dois evita depender dessa configuração.
  const limpo = bruto.trim().includes(",")
    ? bruto.trim().replace(/\./g, "").replace(",", ".")
    : bruto.trim();
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : 0;
}

/**
 * Converte o CSV do relatório em movimentos.
 *
 * A primeira linha de dados costuma vir sem SOURCE_ID: é o saldo inicial do
 * período, não um movimento. Ela sai da lista e volta em `saldoInicial`.
 */
export function lerRelatorio(csv: string): {
  saldoInicial: number;
  movimentos: MovimentoExtrato[];
} {
  const linhas = csv.replace(/^﻿/, "").trim().split(/\r?\n/);
  const cabecalho = (linhas.shift() ?? "").split(";").map((c) => c.trim());
  const posicao = (chave: string) => cabecalho.indexOf(chave);

  const iData = posicao("DATE");
  const iId = posicao("SOURCE_ID");
  const iDescricao = posicao("DESCRIPTION");
  const iCredito = posicao("NET_CREDIT_AMOUNT");
  const iDebito = posicao("NET_DEBIT_AMOUNT");
  const iBruto = posicao("GROSS_AMOUNT");
  const iTarifa = posicao("MP_FEE_AMOUNT");
  const iImposto = posicao("TAXES_AMOUNT");
  const iSaldo = posicao("BALANCE_AMOUNT");
  const iMetodo = posicao("PAYMENT_METHOD");
  const iUnidade = posicao("SUB_UNIT");

  let saldoInicial = 0;
  const movimentos: MovimentoExtrato[] = [];

  for (const linha of linhas) {
    if (!linha.trim()) continue;
    const c = linha.split(";");
    const id = (c[iId] ?? "").trim();

    if (!id) {
      // Linha de abertura do período.
      saldoInicial = numero(c[iSaldo]);
      continue;
    }

    const liquido = numero(c[iCredito]) - numero(c[iDebito]);

    movimentos.push({
      id,
      ocorridoEm: new Date((c[iData] ?? "").trim()).toISOString(),
      descricao: (c[iDescricao] ?? "").trim(),
      liquido,
      bruto: Math.abs(numero(c[iBruto])),
      tarifa: Math.abs(numero(c[iTarifa])) + Math.abs(numero(c[iImposto])),
      saldo: numero(c[iSaldo]),
      metodo: (c[iMetodo] ?? "").trim() || null,
      unidade: (c[iUnidade] ?? "").trim() || null,
    });
  }

  return { saldoInicial, movimentos };
}

/**
 * Junta as linhas que descrevem a mesma operação.
 *
 * Um identificador não corresponde a uma linha. Uma transferência enviada
 * aparece em três:
 *
 *   173883748254  reserve_for_payout  débito  1388   reserva o valor
 *   173883748254  reserve_for_payout  crédito 1388   devolve a reserva
 *   173883748254  payout              débito  1388   paga de fato
 *
 * O efeito real é um débito de 1388, mas quem lê linha a linha vê um débito,
 * um crédito e outro débito da mesma transação. Foi assim que um Pix enviado
 * de R$ 5.260 virou receita: a linha do meio inverteu o sinal, e a última foi
 * descartada por "não ter mudado nada".
 *
 * Somar por identificador devolve a operação como ela é.
 */
export function agruparMovimentos(
  movimentos: MovimentoExtrato[],
): MovimentoExtrato[] {
  const porId = new Map<string, MovimentoExtrato[]>();
  for (const m of movimentos) {
    const linhas = porId.get(m.id) ?? [];
    linhas.push(m);
    porId.set(m.id, linhas);
  }

  const juntos: MovimentoExtrato[] = [];

  for (const [id, linhas] of porId) {
    if (linhas.length === 1) {
      juntos.push(linhas[0]);
      continue;
    }

    const liquido = Number(linhas.reduce((s, l) => s + l.liquido, 0).toFixed(2));
    const tarifa = Number(linhas.reduce((s, l) => s + l.tarifa, 0).toFixed(2));

    // Reservas se anulam; o que dá nome à operação é a linha que sobra.
    const principal =
      linhas.find((l) => !l.descricao.startsWith("reserve_")) ??
      linhas[linhas.length - 1];

    // Reserva criada e devolvida sem pagamento nenhum não movimentou dinheiro.
    if (liquido === 0 && tarifa === 0) continue;

    juntos.push({
      ...principal,
      id,
      liquido,
      tarifa,
      // O bruto reconstruído: o que saiu da conta mais o que ficou retido.
      bruto: Number((Math.abs(liquido) + tarifa).toFixed(2)),
      // O saldo que vale é o da última linha, depois de tudo aplicado.
      saldo: linhas[linhas.length - 1].saldo,
    });
  }

  return juntos;
}

/**
 * Descrições do relatório vêm em código ("reserve_for_payment"). A tesouraria
 * lê o extrato, então cada uma ganha um rótulo em português. O que não estiver
 * no mapa passa direto — é melhor mostrar o código do que engolir a linha.
 */
const ROTULOS: Record<string, string> = {
  payment: "Pagamento recebido",
  refund: "Estorno",
  chargeback: "Chargeback",
  reserve_for_payment: "Pagamento com o saldo",
  reserve_for_dispute: "Valor retido em disputa",
  payout: "Transferência para conta bancária",
  withdrawal: "Saque",
  transfer: "Transferência",
  money_transfer: "Transferência",
  money_release: "Liberação de dinheiro",
  partition_transfer: "Movimentação do cofrinho",
  credit_payment: "Pagamento de empréstimo",
  fee: "Tarifa",
  tax: "Imposto",
};

export function rotuloDoMovimento(descricao: string): string {
  return ROTULOS[descricao] ?? descricao;
}
