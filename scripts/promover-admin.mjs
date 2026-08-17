// Promove um usuário a administrador.
// Uso: npm run promover -- seu@email.com
// Sem argumento, promove o único usuário existente (caso do primeiro acesso).

import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
if (error) {
  console.error("Erro ao listar usuários:", error.message);
  process.exit(1);
}

if (data.users.length === 0) {
  console.error(
    "Nenhum usuário cadastrado. Crie o primeiro em:\n" +
      "  Supabase > Authentication > Users > Add user\n" +
      '  (marque "Auto Confirm User")',
  );
  process.exit(1);
}

const alvoEmail = process.argv[2]?.toLowerCase();
const alvo = alvoEmail
  ? data.users.find((u) => u.email?.toLowerCase() === alvoEmail)
  : data.users.length === 1
    ? data.users[0]
    : null;

if (!alvo) {
  console.error(
    alvoEmail
      ? `Usuário "${alvoEmail}" não encontrado.`
      : "Há mais de um usuário. Informe o e-mail: npm run promover -- fulano@email.com",
  );
  console.error("Usuários:", data.users.map((u) => u.email).join(", "));
  process.exit(1);
}

if (!alvo.email_confirmed_at) {
  console.log(`! ${alvo.email} não está confirmado — confirmando agora.`);
  await admin.auth.admin.updateUserById(alvo.id, { email_confirm: true });
}

const { error: erroPerfil } = await admin
  .from("perfis")
  .update({ papel: "admin" })
  .eq("id", alvo.id);

if (erroPerfil) {
  console.error("Erro ao promover:", erroPerfil.message);
  process.exit(1);
}

console.log(`✓ ${alvo.email} agora é administrador. Faça login em http://localhost:3000`);
