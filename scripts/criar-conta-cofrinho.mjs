/*
 * Dá um destino ao dinheiro que vai para o cofrinho.
 *
 * No Mercado Pago o cofrinho é uma conta à parte: o dinheiro sai do saldo
 * disponível e fica rendendo em outro lugar. O sistema registrava a saída e
 * pronto — o dinheiro simplesmente sumia do patrimônio da igreja, mesmo
 * continuando a ser dela.
 *
 * Este script cria a conta "Cofrinho" e espelha cada movimento: o que sai da
 * conta corrente entra no cofrinho, e vice-versa. As duas pontas ficam
 * marcadas como transferência, então mexem no saldo sem virar receita ou
 * despesa nos relatórios.
 *
 * O rendimento é lançado à parte: ele nunca passou pela conta corrente, então
 * a API de pagamentos nunca o mostrou. É receita de verdade da igreja.
 *
 *   node --env-file=.env.local scripts/criar-conta-cofrinho.mjs
 *   node --env-file=.env.local scripts/criar-conta-cofrinho.mjs --gravar
 */
import { createClient } from "@supabase/supabase-js";

const gravar = process.argv.includes("--gravar");

// O que o Mercado Pago mostra hoje na aba Cofrinhos.
const RENDIMENTO = 214.27;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// -----------------------------------------------------------------
// 1. Encontra os movimentos de cofrinho
// -----------------------------------------------------------------
const transacoes = [];
for (let de = 0; ; de += 1000) {
  const { data, error } = await admin
    .from("transacoes")
    .select("id, conta_id, valor, tipo, status, ocorrido_em, descricao, forma, mp_payment_id, payload")
    .eq("status", "approved")
    .range(de, de + 999);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) break;
  transacoes.push(...data);
  if (data.length < 1000) break;
}

const cofrinho = transacoes.filter(
  (t) => t.forma === "cofrinho" || t.payload?.operation_type === "partition_transfer",
);

const foi = cofrinho.filter((t) => t.tipo === "saida").reduce((s, t) => s + Number(t.valor), 0);
const voltou = cofrinho.filter((t) => t.tipo === "entrada").reduce((s, t) => s + Number(t.valor), 0);

console.log(`movimentos de cofrinho: ${cofrinho.length}`);
console.log(`  foi:    ${foi.toFixed(2)}`);
console.log(`  voltou: ${voltou.toFixed(2)}`);
console.log(`  parado: ${(foi - voltou).toFixed(2)}`);
console.log(`  mais o rendimento de ${RENDIMENTO.toFixed(2)}`);
console.log(`  saldo previsto do cofrinho: ${(foi - voltou + RENDIMENTO).toFixed(2)}`);

// -----------------------------------------------------------------
// 2. Conta de destino
// -----------------------------------------------------------------
const { data: existente } = await admin
  .from("contas")
  .select("id, nome")
  .eq("slug", "cofrinho")
  .maybeSingle();

// -----------------------------------------------------------------
// 3. Espelhos que faltam
// -----------------------------------------------------------------
const jaEspelhados = new Set(
  transacoes
    .filter((t) => String(t.mp_payment_id ?? "").endsWith("-cofrinho"))
    .map((t) => String(t.mp_payment_id).replace(/-cofrinho$/, "")),
);

const aEspelhar = cofrinho.filter((t) => !jaEspelhados.has(String(t.mp_payment_id ?? t.id)));

console.log(`\nconta "Cofrinho": ${existente ? "já existe" : "vai ser criada"}`);
console.log(`espelhos a criar: ${aEspelhar.length}`);
console.log(`lançamento de rendimento: ${jaEspelhados.has("rendimento") ? "já existe" : "vai ser criado"}`);

if (!gravar) {
  console.log("\n(simulação — rode com --gravar para aplicar)");
  process.exit(0);
}

// -----------------------------------------------------------------
// 4. Aplica
// -----------------------------------------------------------------
let contaCofrinho = existente;
if (!contaCofrinho) {
  const { data, error } = await admin
    .from("contas")
    .insert({
      slug: "cofrinho",
      nome: "Cofrinho — Mercado Pago",
      descricao: "Reserva que rende. O dinheiro sai do saldo disponível mas continua sendo da igreja.",
      cor: "#12A150",
    })
    .select("id, nome")
    .single();
  if (error) throw new Error(error.message);
  contaCofrinho = data;
  console.log(`conta criada: ${contaCofrinho.nome}`);
}

// As duas pontas usam a categoria de transferência, para não virarem
// receita nem despesa no relatório.
const { data: categorias } = await admin
  .from("categorias")
  .select("id, tipo")
  .eq("nome", "Transferência entre contas");

const categoriaDe = (tipo) => categorias?.find((c) => c.tipo === tipo)?.id ?? null;

const espelhos = aEspelhar.map((t) => ({
  conta_id: contaCofrinho.id,
  // Invertido de propósito: o que sai da conta corrente entra no cofrinho.
  tipo: t.tipo === "saida" ? "entrada" : "saida",
  valor: t.valor,
  valor_bruto: t.valor,
  tarifa: 0,
  categoria_id: categoriaDe(t.tipo === "saida" ? "entrada" : "saida"),
  descricao: t.descricao ?? (t.tipo === "saida" ? "Guardado no cofrinho" : "Retirado do cofrinho"),
  status: "approved",
  ocorrido_em: t.ocorrido_em,
  origem: "mercadopago",
  mp_payment_id: `${t.mp_payment_id ?? t.id}-cofrinho`,
}));

for (let i = 0; i < espelhos.length; i += 500) {
  const { error } = await admin
    .from("transacoes")
    .upsert(espelhos.slice(i, i + 500), { onConflict: "mp_payment_id" });
  if (error) throw new Error(error.message);
}
console.log(`${espelhos.length} espelhos criados`);

// O rendimento é receita da igreja e não tem contrapartida na conta corrente,
// então entra sozinho, sem categoria de transferência.
const { error: erroRendimento } = await admin.from("transacoes").upsert(
  {
    conta_id: contaCofrinho.id,
    tipo: "entrada",
    valor: RENDIMENTO,
    valor_bruto: RENDIMENTO,
    tarifa: 0,
    descricao: "Rendimento do cofrinho",
    observacao: "Rendeu dentro do cofrinho, sem passar pela conta corrente.",
    status: "approved",
    ocorrido_em: new Date().toISOString(),
    origem: "mercadopago",
    mp_payment_id: "rendimento-cofrinho",
  },
  { onConflict: "mp_payment_id" },
);
if (erroRendimento) throw new Error(erroRendimento.message);
console.log(`rendimento de ${RENDIMENTO.toFixed(2)} lançado`);

const { data: saldos } = await admin
  .from("saldo_por_conta")
  .select("conta_nome, saldo");
console.log("\nsaldos:");
let total = 0;
for (const s of saldos ?? []) {
  console.log(`  ${s.conta_nome.padEnd(26)} ${Number(s.saldo).toFixed(2).padStart(10)}`);
  total += Number(s.saldo);
}
console.log(`  ${"TOTAL".padEnd(26)} ${total.toFixed(2).padStart(10)}`);
