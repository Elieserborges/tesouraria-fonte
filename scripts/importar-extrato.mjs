// Importa o EXTRATO DE CONTA do Mercado Pago (PDF baixado do painel).
//
//   npm run importar-extrato -- ../extratos            # simula
//   npm run importar-extrato -- ../extratos --gravar   # grava
//
// Por que o extrato, se já importamos os pagamentos pela API:
//
//   A API /v1/payments/search só enxerga PAGAMENTOS. Saques, transferências
//   e reservas ("cofrinhos") não são pagamentos e ficavam de fora — por isso
//   o saldo calculado dava R$ 205 mil contra R$ 1 mil reais. Pior: reservar
//   dinheiro aparece na API como pagamento recebido, então entrava no
//   sistema com o sinal INVERTIDO, inflando as receitas.
//
//   O extrato é a fonte da verdade da conta: traz todo movimento com o saldo
//   acumulado. Os IDs são os mesmos da API, então dá para cruzar sem duplicar.
//
// O que o script faz com cada movimento do extrato:
//   - id novo            -> insere a transação que faltava
//   - id já existente    -> corrige o tipo se o sinal divergir; mantém o
//                           valor bruto e os dados do pagador vindos da API
//   - reservas e Pix para a própria igreja -> categoria de transferência

import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const args = process.argv.slice(2);
const GRAVAR = args.includes("--gravar");
const pasta = args.find((a) => !a.startsWith("--")) ?? "../extratos";
const slug = args.find((a) => a.startsWith("--conta="))?.split("=")[1] ?? "conta-1";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ------------------------------------------------------------------
// Leitura do PDF
// ------------------------------------------------------------------
async function linhasDoPdf(caminho) {
  const pdf = await getDocument({
    data: new Uint8Array(readFileSync(caminho)),
    useSystemFonts: true,
  }).promise;

  const linhas = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const conteudo = await (await pdf.getPage(p)).getTextContent();

    // Reagrupa os fragmentos em linhas pela coordenada vertical.
    const porY = new Map();
    for (const item of conteudo.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!porY.has(y)) porY.set(y, []);
      porY.get(y).push({ x: item.transform[4], s: item.str });
    }
    for (const [, itens] of [...porY.entries()].sort((a, b) => b[0] - a[0])) {
      linhas.push(itens.sort((a, b) => a.x - b.x).map((i) => i.s).join(" "));
    }
  }
  return linhas;
}

const paraNumero = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));

/**
 * Extrato em CSV — formato preferível ao PDF.
 *
 * O painel do Mercado Pago oferece os dois. O CSV traz os valores em
 * colunas, sem depender de extrair texto de coordenadas na página, então
 * não há risco de uma descrição longa embaralhar a leitura.
 *
 *   RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE
 *   01-08-2026;Pagamento Desco alvorada;171614529170;-210,38;365,56
 */
function movimentosDoCsv(caminho) {
  const linhas = readFileSync(caminho, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/);

  const inicio = linhas.findIndex((l) => l.startsWith("RELEASE_DATE"));
  if (inicio === -1) {
    throw new Error("Não achei o cabeçalho RELEASE_DATE — o arquivo é um extrato?");
  }

  const movimentos = [];
  for (const linha of linhas.slice(inicio + 1)) {
    if (!linha.trim()) continue;
    const c = linha.split(";");
    if (c.length < 5) continue;

    const [dia, mes, ano] = c[0].trim().split("-");
    if (!ano) continue;

    movimentos.push({
      ocorridoEm: new Date(`${ano}-${mes}-${dia}T12:00:00-03:00`).toISOString(),
      descricao: c[1].trim().replace(/\s+/g, " ").slice(0, 200),
      id: c[2].trim(),
      valor: paraNumero(c[3]),
    });
  }
  return movimentos;
}
const RUIDO = /Data\s+Descrição|ID da operação|^\d+\/\d+$|DETALHE DOS MOVIMENTOS/i;

const LINHA_MOVIMENTO =
  /^(\d{2}-\d{2}-\d{4})\s+(.*?)\s*(\d{8,})\s+R\$\s*(-?[\d.]+,\d{2})\s+R\$\s*(-?[\d.]+,\d{2})/;

async function movimentosDoPdf(caminho) {
  const linhas = await linhasDoPdf(caminho);
  const movimentos = [];

  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(LINHA_MOVIMENTO);
    if (!m) continue;

    // A descrição às vezes quebra para a linha de cima e/ou de baixo.
    const vizinhas = [linhas[i - 1], linhas[i + 1]]
      .filter((l) => l && !LINHA_MOVIMENTO.test(l) && !RUIDO.test(l))
      .join(" ");

    const [dia, mes, ano] = m[1].split("-");
    movimentos.push({
      ocorridoEm: new Date(`${ano}-${mes}-${dia}T12:00:00-03:00`).toISOString(),
      descricao: `${m[2]} ${vizinhas}`.replace(/\s+/g, " ").trim().slice(0, 200),
      id: m[3],
      valor: paraNumero(m[4]),
    });
  }
  return movimentos;
}

// ------------------------------------------------------------------
// Classificação
// ------------------------------------------------------------------
/** Movimento que não é receita nem despesa: só troca o dinheiro de lugar. */
function ehTransferencia(descricao) {
  return (
    /^Dinheiro (reservado|retirado)/i.test(descricao) ||
    /Pix (enviado|recebido) Comunidade Crist[aã] Fonte [Dd]a Vida/i.test(descricao)
  );
}

// ------------------------------------------------------------------
// Execução
// ------------------------------------------------------------------
const { data: conta } = await admin
  .from("contas")
  .select("id, slug, nome")
  .eq("slug", slug)
  .maybeSingle();

if (!conta) {
  console.error(`Conta "${slug}" não encontrada.`);
  process.exit(1);
}

const arquivos = readdirSync(pasta).filter((f) => /.(pdf|csv)$/i.test(f));
if (arquivos.length === 0) {
  console.error(`Nenhum extrato (.pdf ou .csv) em ${pasta}`);
  process.exit(1);
}

console.log(`Conta:  ${conta.nome}`);
console.log(`Pasta:  ${pasta} (${arquivos.length} arquivo(s))`);
console.log(`Modo:   ${GRAVAR ? "GRAVANDO" : "simulação — nada será alterado"}\n`);

const movimentos = [];
for (const f of arquivos) {
  const caminho = `${pasta}/${f}`;
  const ehCsv = /.csv$/i.test(f);
  const m = ehCsv ? movimentosDoCsv(caminho) : await movimentosDoPdf(caminho);
  console.log(`  ${ehCsv ? "csv" : "pdf"}  ${f.slice(0, 38)}… ${m.length} movimentos`);
  movimentos.push(...m);
}

// Um por id: meses podem se sobrepor entre arquivos.
const porId = new Map(movimentos.map((m) => [m.id, m]));
console.log(`\ntotal de movimentos distintos: ${porId.size}`);

// Estado atual do banco
const existentes = new Map();
for (let de = 0; ; de += 1000) {
  const { data } = await admin
    .from("transacoes")
    .select("id, mp_payment_id, valor, tipo, categoria_id")
    .eq("conta_id", conta.id)
    .range(de, de + 999);
  if (!data?.length) break;
  for (const t of data) if (t.mp_payment_id) existentes.set(t.mp_payment_id, t);
  if (data.length < 1000) break;
}

// Categorias de transferência (criadas pelo schema.sql)
const { data: cats } = await admin
  .from("categorias")
  .select("id, tipo, nome, eh_transferencia")
  .eq("eh_transferencia", true);
const catTransferencia = Object.fromEntries((cats ?? []).map((c) => [c.tipo, c.id]));

const inserir = [];
const corrigirTipo = [];
const marcarTransferencia = [];
// Tarifa = o que a pessoa pagou (bruto, vindo da API) menos o que caiu na
// conta (líquido, vindo do extrato). É despesa real, e sem ela o saldo
// calculado fica sempre acima do saldo de verdade.
const tarifaPorMes = new Map();

for (const m of porId.values()) {
  const tipo = m.valor < 0 ? "saida" : "entrada";
  const transferencia = ehTransferencia(m.descricao);
  const existente = existentes.get(m.id);

  if (!existente) {
    inserir.push({
      conta_id: conta.id,
      tipo,
      valor: Math.abs(m.valor),
      descricao: m.descricao,
      status: "approved",
      ocorrido_em: m.ocorridoEm,
      origem: "extrato",
      mp_payment_id: m.id,
      categoria_id: transferencia ? (catTransferencia[tipo] ?? null) : null,
      categoria_automatica: transferencia,
    });
    continue;
  }

  if (existente.tipo !== tipo) {
    corrigirTipo.push({ id: existente.id, de: existente.tipo, para: tipo, mp: m.id });
  }
  if (transferencia && !existente.categoria_id) {
    marcarTransferencia.push({ id: existente.id, tipo });
  }

  if (m.valor > 0 && existente.tipo === "entrada" && !transferencia) {
    const tarifa = Number(existente.valor) - m.valor;
    if (tarifa > 0.004) {
      const mes = m.ocorridoEm.slice(0, 7);
      tarifaPorMes.set(mes, (tarifaPorMes.get(mes) ?? 0) + tarifa);
    }
  }
}

// Uma linha de tarifa por mês, com id fixo para poder reprocessar sem duplicar.
const { data: catTarifa } = await admin
  .from("categorias")
  .select("id")
  .eq("nome", "Tarifas bancárias")
  .eq("tipo", "saida")
  .maybeSingle();

const tarifas = [...tarifaPorMes.entries()].map(([mes, valor]) => ({
  conta_id: conta.id,
  tipo: "saida",
  valor: Number(valor.toFixed(2)),
  descricao: `Tarifas do Mercado Pago — ${mes}`,
  status: "approved",
  ocorrido_em: new Date(`${mes}-01T12:00:00-03:00`).toISOString(),
  origem: "extrato",
  mp_payment_id: `tarifas-${conta.slug}-${mes}`,
  categoria_id: catTarifa?.id ?? null,
  categoria_automatica: Boolean(catTarifa),
}));

const soma = (l, f = (x) => Number(x.valor)) => l.reduce((s, x) => s + f(x), 0);
const moeda = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

console.log(`\nA INSERIR:            ${inserir.length} (${moeda(soma(inserir))})`);
console.log(`  sendo saídas:       ${inserir.filter((x) => x.tipo === "saida").length}`);
console.log(`  já como transferência: ${inserir.filter((x) => x.categoria_id).length}`);
console.log(`SINAL A CORRIGIR:     ${corrigirTipo.length}`);
console.log(`A MARCAR COMO TRANSFERÊNCIA: ${marcarTransferencia.length}`);
console.log(`TARIFAS:              ${tarifas.length} mês(es), ${moeda(soma(tarifas))}`);

if (!GRAVAR) {
  console.log("\nSimulação. Rode de novo com --gravar para aplicar.");
  process.exit(0);
}

for (let i = 0; i < inserir.length; i += 200) {
  const { error } = await admin
    .from("transacoes")
    .upsert(inserir.slice(i, i + 200), { onConflict: "mp_payment_id" });
  if (error) { console.error(`✗ inserção: ${error.message}`); process.exit(1); }
}
console.log(`\n✓ ${inserir.length} transação(ões) inseridas`);

for (const c of corrigirTipo) {
  const { error } = await admin
    .from("transacoes")
    .update({ tipo: c.para })
    .eq("id", c.id);
  if (error) { console.error(`✗ correção ${c.mp}: ${error.message}`); process.exit(1); }
}
console.log(`✓ ${corrigirTipo.length} sinal(is) corrigido(s)`);

for (const t of marcarTransferencia) {
  const catId = catTransferencia[t.tipo];
  if (!catId) continue;
  await admin
    .from("transacoes")
    .update({ categoria_id: catId, categoria_automatica: true })
    .eq("id", t.id);
}
console.log(`✓ ${marcarTransferencia.length} marcada(s) como transferência`);

if (tarifas.length) {
  const { error } = await admin
    .from("transacoes")
    .upsert(tarifas, { onConflict: "mp_payment_id" });
  if (error) { console.error(`✗ tarifas: ${error.message}`); process.exit(1); }
  console.log(`✓ ${tarifas.length} lançamento(s) de tarifa (${moeda(soma(tarifas))})`);
}

const { data: saldo } = await admin.from("saldo_por_conta").select("*");
console.log("\n--- saldo por conta ---");
for (const s of saldo ?? []) {
  console.log(
    `${s.conta_nome}: entradas ${moeda(Number(s.entradas))} · ` +
      `saídas ${moeda(Number(s.saidas))} · saldo ${moeda(Number(s.saldo))}`,
  );
}
