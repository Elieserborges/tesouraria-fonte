import crypto from "node:crypto";

/** Slug da conta -> sufixo das variáveis de ambiente. "conta-1" -> "CONTA_1". */
export function sufixoEnv(slug: string): string {
  return slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

export function credenciais(slug: string) {
  const sufixo = sufixoEnv(slug);
  return {
    accessToken: process.env[`MP_ACCESS_TOKEN_${sufixo}`],
    webhookSecret: process.env[`MP_WEBHOOK_SECRET_${sufixo}`],
  };
}

/**
 * Valida a assinatura do webhook conforme a documentação do Mercado Pago.
 * Manifesto: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 */
export function assinaturaValida({
  assinatura,
  requestId,
  dataId,
  segredo,
}: {
  assinatura: string | null;
  requestId: string | null;
  dataId: string | null;
  segredo: string;
}): boolean {
  if (!assinatura || !dataId) return false;

  const partes = Object.fromEntries(
    assinatura.split(",").map((p) => {
      const [chave, ...resto] = p.split("=");
      return [chave.trim(), resto.join("=").trim()];
    }),
  );

  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  // IDs alfanuméricos entram em minúsculas no manifesto.
  const id = /^\d+$/.test(dataId) ? dataId : dataId.toLowerCase();
  const manifesto = `id:${id};request-id:${requestId ?? ""};ts:${ts};`;

  const esperado = crypto
    .createHmac("sha256", segredo)
    .update(manifesto)
    .digest("hex");

  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type PagamentoMP = {
  id: number;
  status: string;
  status_detail?: string;
  transaction_amount: number;
  currency_id?: string;
  description?: string | null;
  operation_type?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  date_created?: string;
  date_approved?: string | null;
  money_release_date?: string | null;
  collector_id?: number;
  payer?: {
    id?: number | string;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    identification?: { type?: string; number?: string } | null;
  } | null;
  metadata?: Record<string, unknown>;
  /* O líquido e as tarifas: é o que o extrato mostra, e o que fecha o saldo. */
  transaction_details?: {
    net_received_amount?: number;
    total_paid_amount?: number;
  } | null;
  fee_details?: Array<{ type?: string; amount?: number }> | null;
  /* Por onde o dinheiro passou — inclusive de qual banco ele saiu. */
  point_of_interaction?: {
    type?: string;
    transaction_data?: {
      bank_info?: {
        payer?: { long_name?: string | null } | null;
      } | null;
    } | null;
  } | null;
};

export async function buscarPagamento(
  id: string,
  accessToken: string,
): Promise<PagamentoMP> {
  const resposta = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(
      `Mercado Pago respondeu ${resposta.status} ao buscar o pagamento ${id}: ${corpo.slice(0, 300)}`,
    );
  }

  return (await resposta.json()) as PagamentoMP;
}

/**
 * Pagamentos criados numa janela de tempo.
 *
 * Existe porque o webhook só notifica pagamentos que passam pela aplicação —
 * um Pix feito direto para a chave da conta nunca gera notificação. Esta
 * busca enxerga todos.
 *
 * A API devolve respostas divergentes para consultas idênticas (réplicas
 * fora de sincronia), então repetimos e unimos até parar de surgir id novo.
 */
export async function buscarPagamentosNaJanela(
  accessToken: string,
  de: Date,
  ate: Date,
  tentativas = 3,
): Promise<PagamentoMP[]> {
  const vistos = new Map<string, PagamentoMP>();

  for (let i = 0; i < tentativas; i++) {
    const params = new URLSearchParams({
      sort: "date_created",
      criteria: "desc",
      range: "date_created",
      begin_date: de.toISOString(),
      end_date: ate.toISOString(),
      limit: "50",
      offset: "0",
    });

    const resposta = await fetch(
      `https://api.mercadopago.com/v1/payments/search?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );

    if (!resposta.ok) {
      const corpo = await resposta.text();
      throw new Error(
        `Mercado Pago respondeu ${resposta.status} na busca: ${corpo.slice(0, 200)}`,
      );
    }

    const { results = [] } = (await resposta.json()) as { results?: PagamentoMP[] };

    let novos = 0;
    for (const p of results) {
      const id = String(p.id);
      if (!vistos.has(id)) {
        vistos.set(id, p);
        novos += 1;
      }
    }

    // Nada novo nesta rodada: as réplicas já convergiram.
    if (i > 0 && novos === 0) break;
  }

  return [...vistos.values()];
}

/** Nome legível de quem pagou. */
export function nomeContraparte(pagamento: PagamentoMP): string | null {
  const p = pagamento.payer;
  if (!p) return null;
  const nome = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return nome || p.email || null;
}

/**
 * Os três valores de um pagamento.
 *
 * `transaction_amount` é o que a pessoa pagou. O que entra na conta é menos
 * do que isso quando há tarifa, e é esse líquido que o extrato registra e o
 * saldo obedece. Quando a API não informa o líquido (pagamento ainda não
 * liberado, por exemplo), o bruto vale como melhor estimativa.
 */
export function valoresDoPagamento(pagamento: PagamentoMP): {
  liquido: number;
  bruto: number;
  tarifa: number;
} {
  const bruto = Math.abs(pagamento.transaction_amount ?? 0);
  const informado = pagamento.transaction_details?.net_received_amount;
  const liquido =
    typeof informado === "number" && informado > 0 ? Math.abs(informado) : bruto;

  const tarifas = (pagamento.fee_details ?? []).reduce(
    (soma, taxa) => soma + Math.abs(taxa?.amount ?? 0),
    0,
  );

  // Prefere a diferença observada: ela já embute qualquer retenção que não
  // esteja detalhada em `fee_details`.
  const tarifa = liquido < bruto ? Number((bruto - liquido).toFixed(2)) : tarifas;

  return { liquido, bruto, tarifa };
}

/**
 * O banco de onde saiu o dinheiro de uma compra, quando não foi o Mercado Pago.
 *
 * Uma compra no Mercado Livre paga com Pix de outro banco aparece na API do
 * Mercado Pago como pagamento feito pela igreja — é o usuário dela que compra.
 * Mas o dinheiro sai do outro banco, e o saldo do Mercado Pago nem se mexe.
 * Foi assim que um condensador de R$ 229,10 pago pelo PagBank apareceu como
 * saída da conta e deixou o Fluxx abaixo do aplicativo exatamente nesse valor.
 *
 * O campo que separa os dois casos é o nome do banco pagador. Pix enviado do
 * próprio saldo vem sem banco ou com o nome do Mercado Pago; só a compra paga
 * por fora traz outro nome.
 */
export function bancoDeOrigemExterno(pagamento: PagamentoMP): string | null {
  const nome =
    pagamento.point_of_interaction?.transaction_data?.bank_info?.payer?.long_name?.trim();
  if (!nome) return null;
  return /mercado\s*pago/i.test(nome) ? null : nome;
}

/*
 * Status de quem foi pago com dinheiro de outro banco.
 *
 * Fica fora de "approved" e "authorized", então não entra no saldo nem nos
 * relatórios — o escopo do sistema é a conta do Mercado Pago. A linha continua
 * existindo para ninguém achar que a compra sumiu. O mesmo texto aparece em
 * `types.ts`, que não pode importar este arquivo por causa do `node:crypto`.
 */
export const STATUS_FORA_DA_CONTA = "fora_da_conta";

export type ContaDestino = {
  id: string;
  mp_user_id?: string | null;
};

/**
 * Pagamento do Mercado Pago no formato da tabela `transacoes`.
 *
 * Webhook e cron gravam a mesma coisa; manter o mapeamento em um lugar só
 * evita que os dois caminhos divirjam — foi assim que o valor bruto ficou
 * gravado nos dois por meses.
 *
 * `categoria_id` fica de fora de propósito: quem faz upsert com esta linha
 * não pode apagar a classificação que a tesouraria já ajustou à mão. Pelo
 * mesmo motivo o objeto tem sempre as mesmas chaves — num upsert em lote, uma
 * chave presente só em algumas linhas vira nulo nas outras.
 */
export function paraTransacao(conta: ContaDestino, pagamento: PagamentoMP) {
  const somosRecebedor =
    !conta.mp_user_id || String(pagamento.collector_id ?? "") === conta.mp_user_id;
  const { liquido, bruto, tarifa } = valoresDoPagamento(pagamento);

  // Só uma compra da igreja pode ter saído de outro banco. Dinheiro que entra
  // vindo do Santander, do Sicredi ou de onde for é entrada normal.
  const pagoPorFora = !somosRecebedor && bancoDeOrigemExterno(pagamento) !== null;

  return {
    conta_id: conta.id,
    tipo: somosRecebedor ? "entrada" : "saida",
    valor: liquido,
    valor_bruto: bruto,
    tarifa,
    descricao: pagamento.description ?? null,
    contraparte: nomeContraparte(pagamento),
    metodo: pagamento.payment_method_id ?? pagamento.payment_type_id ?? null,
    status: pagoPorFora ? STATUS_FORA_DA_CONTA : (pagamento.status ?? "pending"),
    ocorrido_em:
      pagamento.date_approved ?? pagamento.date_created ?? new Date().toISOString(),
    origem: "mercadopago",
    mp_payment_id: String(pagamento.id),
    payload: pagamento as unknown as Record<string, unknown>,
  };
}
