import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave `service_role`: ignora RLS.
 * Use APENAS em código de servidor sem input direto do usuário
 * (hoje: o webhook do Mercado Pago).
 */
export function criarClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !chave) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.",
    );
  }

  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
