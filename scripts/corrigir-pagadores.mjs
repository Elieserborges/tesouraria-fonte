/*
 * Tira os nomes que foram atribuídos à pessoa errada.
 *
 * O nome de quem paga vem mascarado na API. Para contornar isso eu montei um
 * cadastro que liga o `payer.id` do Mercado Pago a um nome aprendido nos
 * extratos. A ideia só funciona se cada identificador for de uma pessoa — e
 * não é.
 *
 * Pix vindo de outro banco e venda no QR Code presencial chegam todos sob um
 * mesmo identificador genérico. O cadastro aprendeu um nome para ele e
 * carimbou em mais de mil transações: uma doação da Miria aparecia como se
 * fosse da Caroline.
 *
 * O extrato, esse sim, traz o nome certo em cada linha ("Pix recebido FULANO")
 * amarrado ao identificador da transação. É dele que os nomes passam a vir.
 * Onde o extrato não alcança, é melhor não ter nome do que ter o nome errado.
 *
 *   node --env-file=.env.local scripts/corrigir-pagadores.mjs
 *   node --env-file=.env.local scripts/corrigir-pagadores.mjs --gravar
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";

const PASTA = "../extratos";
const gravar = process.argv.includes("--gravar");

/** A partir de quantas pessoas distintas um identificador é considerado genérico. */
const PESSOAS_PARA_SER_GENERICO = 2;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// -----------------------------------------------------------------
// 1. O nome verdadeiro de cada transação, segundo o extrato
// -----------------------------------------------------------------
const PADRAO_DE_NOME =
  /^(?:Pix recebido|Transferência Pix recebida|Pagamento com Código QR Pix)\s+(.+)$/i;

const nomeDoExtrato = new Map();

for (const arquivo of readdirSync(PASTA).filter((f) => f.endsWith(".csv"))) {
  const linhas = readFileSync(`${PASTA}/${arquivo}`, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/);
  const cabecalho = linhas.findIndex((l) => l.startsWith("RELEASE_DATE"));

  for (const linha of linhas.slice(cabecalho + 1)) {
    const c = linha.split(";");
    if (c.length < 5 || !c[2] || !c[2].trim()) continue;
    const achado = c[1].trim().match(PADRAO_DE_NOME);
    if (achado) nomeDoExtrato.set(c[2].trim(), achado[1].trim());
  }
}

console.log(`nomes que os extratos revelam: ${nomeDoExtrato.size}`);

// -----------------------------------------------------------------
// 2. O que está gravado
// -----------------------------------------------------------------
const transacoes = [];
for (let de = 0; ; de += 1000) {
  const { data, error } = await admin
    .from("transacoes")
    .select("id, contraparte, mp_payment_id, forma, ocorrido_em, payload")
    .range(de, de + 999);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) break;
  transacoes.push(...data);
  if (data.length < 1000) break;
}
console.log(`transações: ${transacoes.length}`);

// -----------------------------------------------------------------
// 3. Quais identificadores são genéricos
// -----------------------------------------------------------------
const comparavel = (texto) =>
  String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^pix\s+/, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const pessoasPorId = new Map();
for (const t of transacoes) {
  const idDoPagador = t.payload?.payer?.id;
  const real = nomeDoExtrato.get(String(t.mp_payment_id));
  if (!idDoPagador || !real) continue;

  const nomes = pessoasPorId.get(String(idDoPagador)) ?? new Set();
  nomes.add(comparavel(real));
  pessoasPorId.set(String(idDoPagador), nomes);
}

const genericos = new Set(
  [...pessoasPorId.entries()]
    .filter(([, nomes]) => nomes.size >= PESSOAS_PARA_SER_GENERICO)
    .map(([id]) => id),
);

console.log(`\nidentificadores genéricos encontrados: ${genericos.size}`);
for (const id of genericos) {
  const quantas = transacoes.filter(
    (t) => String(t.payload?.payer?.id ?? "") === id,
  ).length;
  console.log(`  ${id}  ${pessoasPorId.get(id).size} pessoas distintas, ${quantas} transações`);
}

// -----------------------------------------------------------------
// 4. O que fazer com cada transação
// -----------------------------------------------------------------
const restaurar = [];
const apagar = [];
const limpar = [];

for (const t of transacoes) {
  const real = nomeDoExtrato.get(String(t.mp_payment_id));
  const idDoPagador = String(t.payload?.payer?.id ?? "");
  const atual = t.contraparte;

  if (real) {
    // O extrato sabe: ele manda, venha o nome atual de onde vier.
    if (comparavel(atual) !== comparavel(real)) restaurar.push({ t, nome: real });
    continue;
  }

  if (!atual) continue;

  // Sem extrato para conferir: um nome vindo de identificador genérico não
  // tem como estar certo, exceto por sorte.
  if (genericos.has(idDoPagador)) {
    apagar.push(t);
    continue;
  }

  // Sobra o ruído de formato: "Pix FULANO" em vez de "FULANO".
  if (/^pix\s+/i.test(atual)) limpar.push({ t, nome: atual.replace(/^pix\s+/i, "") });
}

console.log(`\nrestaurar pelo extrato: ${restaurar.length}`);
console.log(`apagar (nome sem como conferir, de identificador genérico): ${apagar.length}`);
console.log(`tirar o prefixo "Pix": ${limpar.length}`);

console.log("\namostra do que será restaurado:");
for (const r of restaurar.slice(0, 8)) {
  console.log(`  "${String(r.t.contraparte).slice(0, 30)}"  ->  "${r.nome.slice(0, 34)}"`);
}

if (!gravar) {
  console.log("\n(simulação — rode com --gravar para aplicar)");
  process.exit(0);
}

// -----------------------------------------------------------------
// 5. Aplica
// -----------------------------------------------------------------
for (const r of restaurar) {
  await admin.from("transacoes").update({ contraparte: r.nome }).eq("id", r.t.id);
}
console.log(`\n${restaurar.length} nomes restaurados pelo extrato`);

for (const t of apagar) {
  await admin.from("transacoes").update({ contraparte: null }).eq("id", t.id);
}
console.log(`${apagar.length} nomes apagados`);

for (const l of limpar) {
  await admin.from("transacoes").update({ contraparte: l.nome }).eq("id", l.t.id);
}
console.log(`${limpar.length} prefixos removidos`);

// O cadastro perde os identificadores genéricos, senão o cron recarimba tudo.
for (const id of genericos) {
  await admin.from("pagadores").delete().eq("mp_payer_id", id);
}
console.log(`${genericos.size} identificadores genéricos removidos do cadastro`);
