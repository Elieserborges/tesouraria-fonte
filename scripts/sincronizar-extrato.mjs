/*
 * Recupera a história inteira pelo extrato do Mercado Pago.
 *
 * O uso normal é automático: o cron pede e importa sozinho, em janelas de 15
 * dias. Este script existe para o mutirão inicial — puxar meses de uma vez e
 * acertar o que já está gravado com valor bruto.
 *
 *   node --env-file=.env.local scripts/sincronizar-extrato.mjs 2025-10-01
 *   node --env-file=.env.local scripts/sincronizar-extrato.mjs 2025-10-01 --gravar
 *
 * Sem --gravar ele só mostra o que faria.
 */
import { createClient } from "@supabase/supabase-js";
import {
  baixarRelatorio,
  lerRelatorio,
  pedirRelatorio,
  relatorioPronto,
  rotuloDoMovimento,
} from "../src/lib/mercadopago-extrato.ts";

const DIAS_POR_PEDIDO = 60;
const ESPERA_ENTRE_CONSULTAS = 20_000;
const TENTATIVAS = 90; // ~30 minutos

const desde = process.argv[2] ?? "2025-10-01";
const gravar = process.argv.includes("--gravar");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: contas } = await admin
  .from("contas")
  .select("id, slug, nome")
  .eq("ativa", true);

for (const conta of contas ?? []) {
  const token = process.env[`MP_ACCESS_TOKEN_CONTA_${conta.slug.toUpperCase()}`]
    ?? process.env[`MP_ACCESS_TOKEN_CONTA_1`];
  if (!token) {
    console.log(`${conta.nome}: sem credencial, pulando`);
    continue;
  }

  console.log(`\n=== ${conta.nome} ===`);

  const janelas = [];
  for (let ini = new Date(`${desde}T03:00:00Z`); ini < new Date(); ) {
    const fim = new Date(Math.min(
      ini.getTime() + DIAS_POR_PEDIDO * 86_400_000,
      Date.now(),
    ));
    janelas.push([new Date(ini), fim]);
    ini = new Date(fim.getTime() + 1000);
  }

  console.log(`pedindo ${janelas.length} relatórios de ${DIAS_POR_PEDIDO} dias...`);
  const pedidos = [];
  for (const [ini, fim] of janelas) {
    const pedido = await pedirRelatorio(token, ini, fim);
    pedidos.push({ id: pedido.id, ini, fim });
    console.log(`  ${ini.toISOString().slice(0, 10)} -> ${fim.toISOString().slice(0, 10)}  id ${pedido.id}`);
  }

  console.log("\nesperando o Mercado Pago gerar (pode levar minutos)...");
  const prontos = new Map();
  const jaVistos = new Set();
  for (let tentativa = 0; tentativa < TENTATIVAS && prontos.size < pedidos.length; tentativa++) {
    await new Promise((r) => setTimeout(r, ESPERA_ENTRE_CONSULTAS));
    for (const pedido of pedidos) {
      if (prontos.has(pedido.id)) continue;
      const arquivo = await relatorioPronto(token, pedido.ini, pedido.fim, jaVistos);
      if (arquivo) {
        prontos.set(pedido.id, arquivo);
        jaVistos.add(arquivo.file_name);
        console.log(`  pronto: ${arquivo.file_name}`);
      }
    }
    if (prontos.size < pedidos.length) {
      process.stdout.write(`  ${prontos.size}/${pedidos.length}\r`);
    }
  }

  if (prontos.size === 0) {
    console.log("nenhum relatório ficou pronto no tempo esperado.");
    continue;
  }

  const movimentos = new Map();
  for (const arquivo of prontos.values()) {
    const csv = await baixarRelatorio(token, arquivo.file_name);
    const lido = lerRelatorio(csv);
    for (const m of lido.movimentos) movimentos.set(m.id, m);
  }
  console.log(`\n${movimentos.size} movimentos únicos no extrato`);

  // O que já está gravado, para comparar antes de mexer.
  const existentes = new Map();
  for (let de = 0; ; de += 1000) {
    const { data } = await admin
      .from("transacoes")
      .select("id, valor, tipo, mp_payment_id")
      .eq("conta_id", conta.id)
      .not("mp_payment_id", "is", null)
      .range(de, de + 999);
    if (!data?.length) break;
    for (const t of data) existentes.set(String(t.mp_payment_id), t);
    if (data.length < 1000) break;
  }

  const criar = [];
  const corrigir = [];
  for (const m of movimentos.values()) {
    const tipo = m.liquido >= 0 ? "entrada" : "saida";
    const valor = Number(Math.abs(m.liquido).toFixed(2));
    const atual = existentes.get(m.id);

    if (!atual) {
      criar.push({
        conta_id: conta.id,
        tipo,
        valor,
        valor_bruto: m.bruto > 0 ? m.bruto : valor,
        tarifa: Number(m.tarifa.toFixed(2)),
        descricao: rotuloDoMovimento(m.descricao),
        metodo: m.metodo,
        status: "approved",
        ocorrido_em: m.ocorridoEm,
        origem: "mercadopago",
        mp_payment_id: m.id,
      });
      continue;
    }

    if (Math.abs(Number(atual.valor) - valor) > 0.005 || atual.tipo !== tipo) {
      corrigir.push({ id: atual.id, de: Number(atual.valor), para: valor, tipo, m });
    }
  }

  console.log(`  a criar:    ${criar.length}`);
  console.log(`  a corrigir: ${corrigir.length}`);
  const diferenca = corrigir.reduce(
    (s, c) => s + (c.tipo === "entrada" ? c.para - c.de : c.de - c.para), 0);
  console.log(`  efeito no saldo das correções: ${diferenca.toFixed(2)}`);

  if (!gravar) {
    console.log("\n(simulação — rode com --gravar para aplicar)");
    for (const c of corrigir.slice(0, 5)) {
      console.log(`   ${c.m.id}  ${c.de} -> ${c.para}  ${c.m.descricao}`);
    }
    continue;
  }

  for (let i = 0; i < criar.length; i += 500) {
    const { error } = await admin
      .from("transacoes")
      .upsert(criar.slice(i, i + 500), { onConflict: "mp_payment_id" });
    if (error) console.log("  erro ao criar:", error.message);
  }

  for (const c of corrigir) {
    await admin
      .from("transacoes")
      .update({
        valor: c.para,
        valor_bruto: c.m.bruto > 0 ? c.m.bruto : c.para,
        tarifa: Number(c.m.tarifa.toFixed(2)),
        tipo: c.tipo,
      })
      .eq("id", c.id);
  }

  console.log("gravado.");
}

console.log("\nfim.");
