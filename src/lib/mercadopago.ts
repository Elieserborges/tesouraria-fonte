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

/** Nome legível de quem pagou. */
export function nomeContraparte(pagamento: PagamentoMP): string | null {
  const p = pagamento.payer;
  if (!p) return null;
  const nome = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return nome || p.email || null;
}
