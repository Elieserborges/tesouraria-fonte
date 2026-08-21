import { NextResponse, type NextRequest } from "next/server";
import { tratarNotificacao } from "@/lib/webhook-mercadopago";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ conta: string }> };

/**
 * O endereço descritivo do webhook.
 *
 * Continua valendo — foi ele que ficou cadastrado no Mercado Pago durante
 * meses, e trocar um webhook que funciona por um mais curto sem necessidade
 * seria criar risco à toa. A rota curta em /w existe para quando o endereço
 * não couber no campo do painel.
 */

/** O Mercado Pago faz um GET de teste ao cadastrar a URL. */
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest, contexto: Contexto) {
  const { conta } = await contexto.params;
  return tratarNotificacao(request, conta);
}
