import { createClient } from "@supabase/supabase-js";
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 60000));
  const { data: p } = await a.from("extrato_pedidos").select("id, status, arquivo, movimentos, detalhe").order("criado_em", { ascending: false }).limit(3);
  const { data: e } = await a.from("webhook_eventos").select("recebido_em, tipo, status, detalhe").eq("tipo","cron").order("recebido_em", { ascending: false }).limit(1);
  console.log(`${new Date().toISOString().slice(11,19)}  pedidos: ${(p??[]).map(x=>`${x.id}=${x.status}${x.movimentos?`(${x.movimentos} mov)`:""}`).join(" ")}`);
  if (e?.[0]) console.log(`          ultimo erro de cron: ${e[0].recebido_em.slice(11,19)} ${String(e[0].detalhe).slice(0,60)}`);
  if ((p??[]).some(x => x.status === "importado")) { console.log("\nIMPORTOU."); break; }
}
