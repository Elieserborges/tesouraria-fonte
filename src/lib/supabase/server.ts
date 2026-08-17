import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cliente para Server Components, Server Actions e Route Handlers.
 * Em Server Components o `setAll` falha (cookies são somente leitura) —
 * ignoramos, porque o `proxy.ts` já cuida de renovar a sessão.
 */
export async function criarClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesParaDefinir) {
          try {
            for (const { name, value, options } of cookiesParaDefinir) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component: sem permissão de escrita. Nada a fazer.
          }
        },
      },
    },
  );
}

/** Usuário autenticado + perfil, ou `null` se não houver sessão válida. */
export async function obterSessao() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: perfil } = await supabase
    .from("perfis")
    .select("id, nome, email, papel, criado_em")
    .eq("id", user.id)
    .single();

  return { supabase, user, perfil };
}
