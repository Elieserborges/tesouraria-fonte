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
 * A data como o Mercado Pago aceita: sem milissegundos.
 *
 * `toISOString()` produz "2026-08-05T03:00:00.000Z", e a API recusa isso
 * respondendo "Must specify begin_date parameter" — uma mensagem que aponta
 * para o campo faltando, não para o formato. Foi por isso que o pedido de
 * extrato falhou em silêncio a cada 15 minutos.
 */
function instante(data: Date): string {
  return data.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Coloca um período na fila de geração. Devolve o id para buscar depois. */
export async function pedirRelatorio(
  token: string,
  inicio: Date,
  fim: Date,
): Promise<PedidoRelatorio> {
  const resposta = await chamar("", token, {
    method: "POST",
    body: JSON.stringify({
      begin_date: instante(inicio),
      end_date: instante(fim),
      // Sem isto o pedido nasce invisível e nunca sai da fila: fica em
      // `pending` para sempre, e o arquivo jamais aparece na listagem.
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
