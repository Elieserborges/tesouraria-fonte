// Aprende quem é quem, cruzando o nome que veio do extrato com o payer.id
// que veio da API.
//
//   npm run pagadores            # simula
//   npm run pagadores -- --gravar
//
// A API do Mercado Pago mascara o nome em Pix ("XXXXXXXXXXX"), mas entrega
// o `payer.id` limpo. O extrato traz o nome por extenso. Cruzando os dois,
// o sistema passa a reconhecer a pessoa em todo pagamento futuro dela — sem
// depender do extrato do mês seguinte.

import { createClient } from "@supabase/supabase-js";

const GRAVAR = process.argv.includes("--gravar");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

/** Tira prefixos de operação que sobraram da descrição do extrato. */
function limparNome(bruto) {
  let nome = bruto.trim();
  for (const p of [
    /^Pix\s+(recebido|enviado)?\s*/i,
    /^Pagamento\s+(com\s+Código\s+QR\s+)?(Pix\s+)?/i,
    /^Transferência\s+/i,
    /^Liberação de dinheiro\s*/i,
  ]) {
    nome = nome.replace(p, "").trim();
  }
  nome = nome.replace(/\s+/g, " ").replace(/\d{6,}/g, "").trim();
  return nome;
}

const ehMascarado = (s) =>
  !s || !s.trim() || /^[Xx]+$/.test(s.trim()) || s.includes("@");

// ------------------------------------------------------------------
// Varre as transações aprendendo id -> nome
// ------------------------------------------------------------------
const nomePorId = new Map();
const contagem = new Map();
let comPayerId = 0;
let total = 0;

for (let de = 0; ; de += 500) {
  const { data, error } = await admin
    .from("transacoes")
    .select("contraparte, payload")
    .eq("origem", "mercadopago")
    .range(de, de + 499);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!data?.length) break;
  total += data.length;

  for (const t of data) {
    const id = t.payload?.payer?.id;
    if (!id) continue;
    comPayerId += 1;
    if (ehMascarado(t.contraparte)) continue;

    const nome = limparNome(t.contraparte);
    if (nome.length < 4 || !nome.includes(" ")) continue;

    const chave = String(id);
    const votos = contagem.get(chave) ?? new Map();
    votos.set(nome, (votos.get(nome) ?? 0) + 1);
    contagem.set(chave, votos);
  }

  if (data.length < 500) break;
}

/*
 * Identificador com mais de um nome não é de uma pessoa.
 *
 * Pix vindo de outro banco e venda no QR Code presencial chegam todos sob um
 * mesmo identificador genérico — um deles cobre 273 pessoas. Ficar
 * com o nome mais votado carimbava esse nome em mais de mil transações: a
 * doação de uma pessoa aparecia como se fosse de outra.
 *
 * O nome mais frequente só vale quando é o único.
 */
let genericos = 0;
for (const [id, votos] of contagem) {
  if (votos.size > 1) {
    genericos += 1;
    continue;
  }
  const [melhor] = [...votos.entries()];
  nomePorId.set(id, melhor[0]);
}

console.log(`transações analisadas:     ${total}`);
console.log(`com payer.id:              ${comPayerId}`);
console.log(`pessoas identificadas:     ${nomePorId.size}`);
console.log(`identificadores genéricos:  ${genericos} (descartados)`);

console.log("\namostra:");
for (const [id, nome] of [...nomePorId.entries()].slice(0, 10)) {
  console.log(`  ${id.padStart(12)} -> ${nome}`);
}

if (!GRAVAR) {
  console.log("\nSimulação. Rode com --gravar para aplicar.");
  process.exit(0);
}

// ------------------------------------------------------------------
// Grava o cadastro e aplica nas transações mascaradas
// ------------------------------------------------------------------
const linhas = [...nomePorId.entries()].map(([mp_payer_id, nome]) => ({
  mp_payer_id,
  nome,
  atualizado_em: new Date().toISOString(),
}));

for (let i = 0; i < linhas.length; i += 200) {
  const { error } = await admin
    .from("pagadores")
    .upsert(linhas.slice(i, i + 200), { onConflict: "mp_payer_id" });
  if (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
}
console.log(`\n✓ ${linhas.length} pagador(es) no cadastro`);

const { data: aplicadas, error: erroAplicar } = await admin.rpc(
  "aplicar_nomes_pagadores",
);
if (erroAplicar) {
  console.error(`✗ ${erroAplicar.message}`);
  process.exit(1);
}
console.log(`✓ ${aplicadas} transação(ões) ganharam o nome de quem pagou`);
