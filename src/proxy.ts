import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const ROTAS_PUBLICAS = ["/login", "/auth"];

/**
 * Renova o cookie de sessão do Supabase a cada request e barra o acesso
 * a rotas privadas. É uma checagem otimista — a autorização de verdade
 * está no RLS do banco e nas páginas do servidor.
 */
export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesParaDefinir, headers) {
          for (const { name, value } of cookiesParaDefinir) {
            request.cookies.set(name, value);
          }
          resposta = NextResponse.next({ request });
          for (const { name, value, options } of cookiesParaDefinir) {
            resposta.cookies.set(name, value, options);
          }
          for (const [chave, valor] of Object.entries(headers)) {
            resposta.headers.set(chave, valor);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const ehPublica = ROTAS_PUBLICAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  );

  if (!user && !ehPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("proximo", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return resposta;
}

export const config = {
  matcher: [
    /*
     * Todas as rotas, exceto:
     * - arquivos estáticos do Next
     * - imagens e ícones
     * - /api/webhooks (chamado pelo Mercado Pago, sem sessão)
     * - /w (o mesmo webhook num endereço curto, que cabe no campo do painel)
     * - /api/cron (chamado pelo Vercel Cron, autentica pelo CRON_SECRET)
     *
     * Sem essas exceções o proxy redireciona para /login, e quem chama de
     * fora recebe um 307 em vez da resposta — foi exatamente o que fez o
     * webhook falhar em silêncio. Toda rota nova chamada de fora precisa
     * entrar nesta lista, ou repete a mesma falha.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|w/|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
