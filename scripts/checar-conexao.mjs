import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publica = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secreta = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("URL:", url);
console.log("publishable:", publica?.slice(0, 20) + "…");
console.log("secret:", secreta?.slice(0, 14) + "…");
console.log("---");

const admin = createClient(url, secreta, { auth: { persistSession: false } });

const tabelas = ["contas", "categorias", "transacoes", "perfis", "webhook_eventos"];
for (const t of tabelas) {
  const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
  console.log(error ? `✗ ${t}: ${error.message}` : `✓ ${t}: ${count} registro(s)`);
}

const { data: view, error: erroView } = await admin.from("saldo_por_conta").select("*");
console.log(erroView ? `✗ view saldo_por_conta: ${erroView.message}` : `✓ view saldo_por_conta: ${view.length} conta(s)`);

const { data: usuarios, error: erroAuth } = await admin.auth.admin.listUsers({ perPage: 50 });
if (erroAuth) {
  console.log(`✗ auth: ${erroAuth.message}`);
} else {
  console.log(`✓ auth: ${usuarios.users.length} usuário(s)`);
  const { data: perfis } = await admin.from("perfis").select("email, papel");
  for (const u of usuarios.users) {
    const p = perfis?.find((x) => x.email === u.email);
    console.log(`   · ${u.email} — papel: ${p?.papel ?? "SEM PERFIL"} — confirmado: ${u.email_confirmed_at ? "sim" : "NÃO"}`);
  }
}

// A chave pública deve ser barrada pelo RLS quando não há sessão.
const anon = createClient(url, publica, { auth: { persistSession: false } });
const { data: vazamento, error: erroAnon } = await anon.from("transacoes").select("id").limit(1);
console.log("---");
console.log(
  erroAnon || (vazamento && vazamento.length === 0)
    ? "✓ RLS: chave pública sem sessão não lê transações"
    : "✗ RLS: chave pública leu dados sem login!",
);
