import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  buscarPagamentosNaJanela,
  credenciais,
  nomeContraparte,
  type PagamentoMP,
} from "@/lib/mercadopago";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Quantas horas para trás varrer. Cobre folgado o intervalo entre execuções. */
const JANELA_HORAS = 24;

type ContaSincronizavel = {
  id: string;
  slug: string;
  nome: string;
  mp_user_id: string | null;
};

/**
 * Sincronização agendada com o Mercado Pago.
 *
 * O webhook só recebe pagamentos que passam pela aplicação; um Pix feito
 * direto para a chave da conta nunca notifica. Esta rotina busca pela API
 * e cobre esse caso — os dois convivem sem duplicar, porque a gravação é
 * `upsert` por mp_payment_id.
 *
 * Disparada pelo Vercel Cron (ver vercel.json), que envia o CRON_SECRET no
 * cabeçalho Authorization.
 */
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!segredo) {
    return NextResponse.json({ erro: "CRON_SECRET não configurado" }, { status: 500 });
  }
  if (autorizacao !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const admin = criarClienteAdmin();
  const ate = new Date();
  const de = new Date(ate.getTime() - JANELA_HORAS * 3600 * 1000);

  const { data: contas } = await admin
    .from("contas")
    .select("id, slug, nome, mp_user_id")
    .eq("ativa", true);

  const resultado: Record<string, unknown>[] = [];

  for (const conta of (contas ?? []) as ContaSincronizavel[]) {
    const { accessToken } = credenciais(conta.slug);
    if (!accessToken) continue; // conta sem credencial do Mercado Pago

    try {
      const pagamentos = await buscarPagamentosNaJanela(accessToken, de, ate);

      if (pagamentos.length > 0) {
        const linhas = pagamentos.map((p) => paraTransacao(conta, p));
        const { error } = await admin
          .from("transacoes")
          .upsert(linhas, { onConflict: "mp_payment_id" });

        if (error) throw new Error(error.message);
      }

      resultado.push({ conta: conta.slug, encontrados: pagamentos.length });
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "erro desconhecido";
      await admin.from("webhook_eventos").insert({
        conta_slug: conta.slug,
        tipo: "cron",
        status: "erro",
        detalhe: mensagem,
      });
      resultado.push({ conta: conta.slug, erro: mensagem });
    }
  }

  // Nome de quem pagou vem mascarado na API; o cadastro de pagadores
  // preenche a partir do que os extratos ja ensinaram.
  const { data: nomeados } = await admin.rpc("aplicar_nomes_pagadores");

  // Classifica o que casar com as regras já cadastradas.
  const { data: classificadas } = await admin.rpc("aplicar_regras_categoria");

  return NextResponse.json({
    ok: true,
    janela: { de: de.toISOString(), ate: ate.toISOString() },
    contas: resultado,
    nomeados: Number(nomeados ?? 0),
    classificadas: Number(classificadas ?? 0),
  });
}

/** Mesmo mapeamento do webhook — mantenha os dois em sincronia. */
function paraTransacao(conta: ContaSincronizavel, pagamento: PagamentoMP) {
  const somosRecebedor =
    !conta.mp_user_id || String(pagamento.collector_id ?? "") === conta.mp_user_id;

  return {
    conta_id: conta.id,
    tipo: somosRecebedor ? "entrada" : "saida",
    valor: Math.abs(pagamento.transaction_amount ?? 0),
    descricao: pagamento.description ?? null,
    contraparte: nomeContraparte(pagamento),
    metodo: pagamento.payment_method_id ?? pagamento.payment_type_id ?? null,
    status: pagamento.status ?? "pending",
    ocorrido_em:
      pagamento.date_approved ?? pagamento.date_created ?? new Date().toISOString(),
    origem: "mercadopago",
    mp_payment_id: String(pagamento.id),
    payload: pagamento as unknown as Record<string, unknown>,
  };
}
