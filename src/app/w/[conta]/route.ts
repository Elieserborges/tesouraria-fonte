import { NextResponse, type NextRequest } from "next/server";
import { tratarNotificacao } from "@/lib/webhook-mercadopago";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ conta: string }> };

/**
 * O webhook num endereço curto.
 *
 * O campo de URL do painel do Mercado Pago corta em 50 caracteres. Com o
 * domínio próprio, o endereço descritivo passou de 64 e chegava lá cortado —
 * apontando para uma rota que não existe, o que devolve 404 e faz as
 * notificações sumirem sem nenhum aviso.
 *
 *   https://www.fluxxfinance.com.br/api/webhooks/mercadopago/conta-1   64
 *   https://www.fluxxfinance.com.br/w/conta-1                          40
 *
 * Trata exatamente as mesmas notificações que o endereço longo: as duas rotas
 * chamam a mesma função, então nenhuma pode divergir da outra com o tempo.
 */

/** O Mercado Pago faz um GET de teste ao cadastrar a URL. */
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest, contexto: Contexto) {
  const { conta } = await contexto.params;

  // Aceita "1" além de "conta-1": se o campo apertar de novo, o endereço
  // ainda encolhe para /w/1 sem precisar mexer no cadastro das contas.
  const slug = /^\d+$/.test(conta) ? `conta-${conta}` : conta;

  return tratarNotificacao(request, slug);
}
