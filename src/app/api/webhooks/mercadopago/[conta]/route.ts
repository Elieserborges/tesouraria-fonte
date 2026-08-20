import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  assinaturaValida,
  buscarPagamento,
  credenciais,
  paraTransacao,
  type PagamentoMP,
} from "@/lib/mercadopago";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ conta: string }> };

type NotificacaoMP = {
  id?: number | string;
  type?: string;
  topic?: string;
  action?: string;
  data?: { id?: string | number };
  resource?: string;
};

/** O Mercado Pago faz um GET de teste ao cadastrar a URL. */
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest, contexto: Contexto) {
  const { conta: slug } = await contexto.params;
  const admin = criarClienteAdmin();

  let corpo: NotificacaoMP = {};
  try {
    corpo = (await request.json()) as NotificacaoMP;
  } catch {
    // Notificações antigas podem vir sem corpo JSON — os dados estão na query.
  }

  const url = new URL(request.url);
  const tipo = corpo.type ?? corpo.topic ?? url.searchParams.get("type") ?? "";
  const dataId =
    url.searchParams.get("data.id") ??
    (corpo.data?.id != null ? String(corpo.data.id) : null) ??
    url.searchParams.get("id");

  async function registrar(status: string, detalhe?: string) {
    await admin.from("webhook_eventos").insert({
      conta_slug: slug,
      tipo,
      acao: corpo.action ?? null,
      recurso_id: dataId,
      status,
      detalhe: detalhe ?? null,
      payload: corpo as unknown as Record<string, unknown>,
    });
  }

  // ---------------------------------------------------------------
  // 1. Conta e credenciais
  // ---------------------------------------------------------------
  const { data: conta } = await admin
    .from("contas")
    .select("id, slug, nome, mp_user_id")
    .eq("slug", slug)
    .maybeSingle();

  if (!conta) {
    await registrar("erro", `Conta "${slug}" não cadastrada.`);
    return NextResponse.json({ erro: "conta desconhecida" }, { status: 404 });
  }

  const { accessToken, webhookSecret } = credenciais(slug);
  if (!accessToken || !webhookSecret) {
    await registrar("erro", `Credenciais ausentes para a conta "${slug}".`);
    return NextResponse.json({ erro: "credenciais ausentes" }, { status: 500 });
  }

  // ---------------------------------------------------------------
  // 2. Assinatura
  // ---------------------------------------------------------------
  const valida = assinaturaValida({
    assinatura: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
    segredo: webhookSecret,
  });

  if (!valida) {
    await registrar("erro", "Assinatura inválida.");
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  // ---------------------------------------------------------------
  // 3. Só tratamos notificações de pagamento
  // ---------------------------------------------------------------
  if (!tipo.startsWith("payment") || !dataId) {
    await registrar("ignorado", `Tipo "${tipo}" não é tratado.`);
    return NextResponse.json({ ok: true });
  }

  // ---------------------------------------------------------------
  // 4. Busca o pagamento e grava a transação
  // ---------------------------------------------------------------
  try {
    const pagamento = await buscarPagamento(dataId, accessToken);
    await salvarTransacao(admin, conta, pagamento);
    await registrar("processado");
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    await registrar("erro", mensagem);
    // 500 faz o Mercado Pago reenviar a notificação depois.
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

type ContaMinima = { id: string; slug: string; nome: string; mp_user_id: string | null };

async function salvarTransacao(
  admin: ReturnType<typeof criarClienteAdmin>,
  conta: ContaMinima,
  pagamento: PagamentoMP,
) {
  const registro = paraTransacao(conta, pagamento);

  // upsert por mp_payment_id: reprocessar a mesma notificação é seguro,
  // e mudanças de status (aprovado -> estornado) atualizam o registro.
  // `categoria_id` fica de fora para não apagar a classificação já feita.
  const { error } = await admin
    .from("transacoes")
    .upsert(registro, { onConflict: "mp_payment_id" });

  if (error) throw new Error(`Falha ao gravar a transação: ${error.message}`);

  // Classifica pela regra da descrição, se houver. Só preenche o que está
  // vazio, então nunca desfaz uma categorização manual.
  const { error: erroRegras } = await admin.rpc("aplicar_regras_categoria");
  if (erroRegras) {
    // Não é motivo para devolver erro ao Mercado Pago: a transação já foi
    // gravada, e ela apenas fica sem categoria até alguém classificar.
    console.error("Falha ao aplicar regras de categoria:", erroRegras.message);
  }
}
