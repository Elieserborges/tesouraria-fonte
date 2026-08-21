import { createClient } from "@supabase/supabase-js";
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const inicio = new Date().toISOString();
console.log("vigiando a partir de", inicio.slice(11, 19));
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 45000));
  const { data: ev } = await a.from("webhook_eventos").select("recebido_em, tipo, status, detalhe, recurso_id")
    .gt("recebido_em", inicio).order("recebido_em");
  const { data: ped } = await a.from("extrato_pedidos").select("id, status, arquivo, movimentos").order("criado_em", { ascending: false }).limit(3);
  if (ev?.length) {
    for (const e of ev) console.log(`  ${e.recebido_em.slice(11,19)}  ${String(e.tipo||"webhook").padEnd(8)} ${String(e.status).padEnd(11)} ${e.recurso_id ?? "-"}  ${String(e.detalhe ?? "").slice(0,60)}`);
  }
  if (ped?.length) console.log(`  pedidos de extrato: ${ped.map(p => `${p.id}=${p.status}${p.movimentos ? `(${p.movimentos})` : ""}`).join(" ")}`);
}
