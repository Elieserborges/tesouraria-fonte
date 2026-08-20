/*
 * Conciliação com o extrato do Mercado Pago.
 *
 * O extrato é o razão da conta: começa em zero, traz o saldo parcial linha a
 * linha e fecha com o saldo que o banco reconhece. A API de pagamentos conta
 * outra história — devolve o valor bruto e às vezes registra um pagamento que
 * entrou na conta por outra linha, com outro identificador.
 *
 * Aqui o extrato manda. Cada linha dele vira a verdade sobre valor e sentido;
 * o que a API tem de melhor (nome de quem pagou, descrição, categoria) fica
 * intocado.
 *
 *   node --env-file=.env.local scripts/conciliar-extrato.mjs
 *   node --env-file=.env.local scripts/conciliar-extrato.mjs --gravar
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const PASTA = "../extratos";
const gravar = process.argv.includes("--gravar");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const paraNumero = (t) => Number(String(t).replace(/\./g, "").replace(",", "."));

// -----------------------------------------------------------------
// 1. Lê os extratos e confere se a corrente fecha
// -----------------------------------------------------------------
const periodos = [];
const movimentos = new Map();

for (const arquivo of readdirSync(PASTA).filter((f) => f.endsWith(".csv"))) {
  const conteudo = readFileSync(`${PASTA}/${arquivo}`, "utf8").replace(/^﻿/, "");
  const linhas = conteudo.split(/\r?\n/);
  const [inicial, , , final] = linhas[1].split(";").map(paraNumero);
  const cabecalho = linhas.findIndex((l) => l.startsWith("RELEASE_DATE"));

  const doArquivo = [];
  for (const linha of linhas.slice(cabecalho + 1)) {
    const c = linha.split(";");
    if (c.length < 5 || !c[2] || !c[2].trim()) continue;
    const [dia, mes, ano] = c[0].trim().split("-");
    doArquivo.push({
      id: c[2].trim(),
      ocorridoEm: new Date(`${ano}-${mes}-${dia}T12:00:00-03:00`).toISOString(),
      dia: `${ano}-${mes}-${dia}`,
      descricao: c[1].trim(),
      liquido: paraNumero(c[3]),
    });
  }

  periodos.push({
    arquivo,
    inicial,
    final,
    de: doArquivo[0].dia,
    ate: doArquivo[doArquivo.length - 1].dia,
    linhas: doArquivo,
  });
}

periodos.sort((a, b) => a.de.localeCompare(b.de));

let esperado = null;
for (const p of periodos) {
  if (esperado !== null && Math.abs(esperado - p.inicial) > 0.005) {
    console.error(`corrente quebrada em ${p.arquivo}: abre em ${p.inicial}, o anterior fechou em ${esperado}`);
    process.exit(1);
  }
  esperado = p.final;

  for (const m of p.linhas) {
    // Uma liberação e o cancelamento dela dividem o mesmo identificador. O
    // primeiro fica com o id original; o segundo ganha sufixo, senão um
    // sobrescreve o outro e o saldo perde a diferença.
    let chave = m.id;
    for (let i = 2; movimentos.has(chave); i++) chave = `${m.id}-${i}`;
    movimentos.set(chave, { ...m, id: chave });
  }
}

const PRIMEIRO_DIA = periodos[0].de;
const ULTIMO_DIA = periodos[periodos.length - 1].ate;
const SALDO_OFICIAL = esperado;

console.log(`extratos: ${periodos.length} arquivos, ${PRIMEIRO_DIA} a ${ULTIMO_DIA}`);
console.log(`movimentos: ${movimentos.size}`);
console.log(`saldo oficial em ${ULTIMO_DIA}: ${SALDO_OFICIAL.toFixed(2)}`);

const somaExtrato = [...movimentos.values()].reduce((s, m) => s + m.liquido, 0);
if (Math.abs(somaExtrato - SALDO_OFICIAL) > 0.02) {
  console.error(`os movimentos somam ${somaExtrato.toFixed(2)}, mas o extrato fecha em ${SALDO_OFICIAL.toFixed(2)}`);
  process.exit(1);
}
console.log("corrente conferida: soma dos movimentos = saldo final\n");

// -----------------------------------------------------------------
// 2. Lê o que está gravado
// -----------------------------------------------------------------
const gravadas = [];
for (let de = 0; ; de += 1000) {
  const { data, error } = await admin
    .from("transacoes")
    .select("id, valor, tipo, status, ocorrido_em, descricao, origem, mp_payment_id, payload")
    .range(de, de + 999);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) break;
  gravadas.push(...data);
  if (data.length < 1000) break;
}
console.log(`transações no banco: ${gravadas.length}`);

const porId = new Map();
for (const t of gravadas) if (t.mp_payment_id) porId.set(String(t.mp_payment_id), t);

// -----------------------------------------------------------------
// 3. Decide o que fazer com cada linha
// -----------------------------------------------------------------
const corrigir = [];
const criar = [];
const neutralizar = [];
const posteriores = [];

for (const m of movimentos.values()) {
  const tipo = m.liquido >= 0 ? "entrada" : "saida";
  const valor = Number(Math.abs(m.liquido).toFixed(2));
  const atual = porId.get(m.id);

  if (!atual) {
    criar.push({ movimento: m, tipo, valor });
    continue;
  }

  const bruto = Number(atual.payload?.transaction_amount ?? 0) || valor;
  const tarifa = bruto > valor ? Number((bruto - valor).toFixed(2)) : 0;
  const precisa =
    Math.abs(Number(atual.valor) - valor) > 0.005 ||
    atual.tipo !== tipo ||
    atual.status !== "approved";

  if (precisa) corrigir.push({ atual, movimento: m, tipo, valor, bruto, tarifa });
}

for (const t of gravadas) {
  const dia = t.ocorrido_em.slice(0, 10);
  if (t.mp_payment_id && movimentos.has(String(t.mp_payment_id))) continue;

  if (dia > ULTIMO_DIA) {
    // Depois do último extrato só a API sabe. Usa o líquido que ela informa.
    const liquido = t.payload?.transaction_details?.net_received_amount;
    if (typeof liquido === "number" && Math.abs(Number(t.valor) - liquido) > 0.005) {
      posteriores.push({ atual: t, valor: Number(liquido.toFixed(2)), bruto: Number(t.valor) });
    }
    continue;
  }

  if (t.status !== "approved") continue;

  const motivo = String(t.mp_payment_id ?? "").startsWith("tarifas-")
    ? "linha de tarifa estimada, substituída pela tarifa real de cada transação"
    : dia < PRIMEIRO_DIA
      ? `anterior ao início do extrato (${PRIMEIRO_DIA}), quando o saldo era zero`
      : "o dinheiro entrou na conta por outra linha do extrato (liberação)";

  neutralizar.push({ atual: t, motivo });
}

// -----------------------------------------------------------------
// 4. Mostra o efeito antes de mexer
// -----------------------------------------------------------------
const efeito = (t) => (t.tipo === "entrada" ? Number(t.valor) : -Number(t.valor));
const saldoAtual = gravadas
  .filter((t) => t.status === "approved")
  .reduce((s, t) => s + efeito(t), 0);

/*
 * Prevê o saldo montando o estado final, não somando diferenças.
 *
 * Somar deltas erra quando a linha muda de status: uma transação hoje
 * recusada não está no saldo, então "corrigir" o valor dela não é uma
 * diferença, é uma entrada nova. Reconstruir o estado inteiro não tem
 * essa armadilha.
 */
const depois = new Map();
for (const t of gravadas) {
  // Para conferir contra o extrato vale a data dele: é quando o dinheiro
  // entrou na conta. A API guarda a data do pagamento, que para cartão pode
  // ser bem antes. As duas ficam no banco; só a conferência usa a do extrato.
  const noExtrato = t.mp_payment_id ? movimentos.get(String(t.mp_payment_id)) : null;
  depois.set(t.id, {
    tipo: t.tipo,
    valor: Number(t.valor),
    status: t.status,
    dia: noExtrato ? noExtrato.dia : t.ocorrido_em.slice(0, 10),
  });
}
for (const c of corrigir) {
  depois.set(c.atual.id, { tipo: c.tipo, valor: c.valor, status: "approved", dia: c.movimento.dia });
}
for (const x of neutralizar) {
  depois.get(x.atual.id).status = "duplicado";
}
for (const p of posteriores) {
  const linha = depois.get(p.atual.id);
  linha.valor = p.valor;
}
for (const c of criar) {
  depois.set(`novo:${c.movimento.id}`, { tipo: c.tipo, valor: c.valor, status: "approved", dia: c.movimento.dia });
}

const aprovadas = [...depois.values()].filter((l) => l.status === "approved");
const previsto = aprovadas.reduce((s, l) => s + efeito(l), 0);
const ateOExtrato = aprovadas.filter((l) => l.dia <= ULTIMO_DIA).reduce((s, l) => s + efeito(l), 0);
const depoisDoExtrato = previsto - ateOExtrato;

console.log(`\nsaldo hoje no sistema: ${saldoAtual.toFixed(2)}`);
console.log(`  corrigir valor/sentido: ${String(corrigir.length).padStart(5)}`);
console.log(`  criar (faltavam):       ${String(criar.length).padStart(5)}`);
console.log(`  neutralizar:            ${String(neutralizar.length).padStart(5)}`);
console.log(`  ajustar (pós-extrato):  ${String(posteriores.length).padStart(5)}`);

console.log(`\nsaldo previsto depois: ${previsto.toFixed(2)}`);
console.log(`  até ${ULTIMO_DIA}:  ${ateOExtrato.toFixed(2)}   (o extrato diz ${SALDO_OFICIAL.toFixed(2)})`);
console.log(`  depois disso:    ${depoisDoExtrato.toFixed(2)}`);

const desvio = ateOExtrato - SALDO_OFICIAL;
if (Math.abs(desvio) > 0.02) {
  console.log(`\n  ATENÇÃO: sobra ${desvio.toFixed(2)} no período do extrato. Não aplique antes de entender.`);
}

const motivos = {};
for (const x of neutralizar) motivos[x.motivo] = (motivos[x.motivo] ?? 0) + 1;
console.log("\npor que neutralizar:");
for (const [motivo, n] of Object.entries(motivos)) console.log(`  ${String(n).padStart(3)}x  ${motivo}`);

// Guarda o que sai de cena, para poder conferir depois.
writeFileSync(
  "neutralizadas.csv",
  "data;tipo;valor;descricao;mp_payment_id;motivo\n" +
    neutralizar
      .map((x) =>
        [
          x.atual.ocorrido_em.slice(0, 10),
          x.atual.tipo,
          x.atual.valor,
          String(x.atual.descricao ?? "").replace(/;/g, ","),
          x.atual.mp_payment_id,
          x.motivo,
        ].join(";"),
      )
      .join("\n"),
);
console.log("\nlista completa das neutralizadas em neutralizadas.csv");

if (!gravar) {
  console.log("\n(simulação — rode com --gravar para aplicar)");
  process.exit(0);
}

// -----------------------------------------------------------------
// 5. Aplica
// -----------------------------------------------------------------
console.log("\ngravando...");

for (const c of corrigir) {
  await admin
    .from("transacoes")
    .update({ valor: c.valor, valor_bruto: c.bruto, tarifa: c.tarifa, tipo: c.tipo, status: "approved" })
    .eq("id", c.atual.id);
}
console.log(`  ${corrigir.length} corrigidas`);

const { data: conta } = await admin.from("contas").select("id").eq("slug", "conta-1").single();
const novas = criar.map((c) => ({
  conta_id: conta.id,
  tipo: c.tipo,
  valor: c.valor,
  valor_bruto: c.valor,
  tarifa: 0,
  descricao: c.movimento.descricao,
  status: "approved",
  ocorrido_em: c.movimento.ocorridoEm,
  origem: "mercadopago",
  mp_payment_id: c.movimento.id,
}));
for (let i = 0; i < novas.length; i += 500) {
  const { error } = await admin
    .from("transacoes")
    .upsert(novas.slice(i, i + 500), { onConflict: "mp_payment_id" });
  if (error) console.log("  erro ao criar:", error.message);
}
console.log(`  ${novas.length} criadas`);

for (const x of neutralizar) {
  await admin
    .from("transacoes")
    .update({ status: "duplicado", observacao: x.motivo })
    .eq("id", x.atual.id);
}
console.log(`  ${neutralizar.length} neutralizadas`);

for (const p of posteriores) {
  await admin
    .from("transacoes")
    .update({ valor: p.valor, valor_bruto: p.bruto, tarifa: Number((p.bruto - p.valor).toFixed(2)) })
    .eq("id", p.atual.id);
}
console.log(`  ${posteriores.length} ajustadas`);

const { data: saldo } = await admin.from("saldo_por_conta").select("saldo, entradas, saidas");
console.log(`\nsaldo agora: ${JSON.stringify(saldo)}`);
