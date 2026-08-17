// Importa o histórico de pagamentos do Mercado Pago para dentro do sistema.
//
//   npm run importar                 -> últimos 12 meses da conta-1
//   npm run importar -- 2026-01      -> desde janeiro de 2026
//   npm run importar -- 2026-03-15   -> desde 15/03/2026
//   npm run importar -- 2026-01 conta-2
//
// As transações entram com `upsert` por mp_payment_id — exatamente como o
// webhook faz. Rodar duas vezes não duplica nada, e um pagamento que já tenha
// sido categorizado à mão mantém a categoria.
//
// Acrescente --simular para ver o que seria importado sem gravar no banco.

import { createClient } from "@supabase/supabase-js";

const SIMULAR = process.argv.includes("--simular");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const desdeArg = args[0];
const slug = args[1] ?? "conta-1";

const sufixo = slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
const accessToken = process.env[`MP_ACCESS_TOKEN_${sufixo}`];

if (!accessToken) {
  console.error(
    `Falta a variável MP_ACCESS_TOKEN_${sufixo} no .env.local.\n` +
      "Ela fica em: Mercado Pago > Suas integrações > sua aplicação > Credenciais de produção.",
  );
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ------------------------------------------------------------------
// Conta de destino
// ------------------------------------------------------------------
const { data: conta, error: erroConta } = await admin
  .from("contas")
  .select("id, slug, nome, mp_user_id")
  .eq("slug", slug)
  .maybeSingle();

if (erroConta || !conta) {
  console.error(`Conta "${slug}" não encontrada no banco.`);
  process.exit(1);
}

// ------------------------------------------------------------------
// Período
// ------------------------------------------------------------------
function inicioDe(texto) {
  if (!texto) {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - 11, 1);
  }
  if (/^\d{4}-\d{2}$/.test(texto)) {
    const [a, m] = texto.split("-").map(Number);
    return new Date(a, m - 1, 1);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const [a, m, d] = texto.split("-").map(Number);
    return new Date(a, m - 1, d);
  }
  console.error(`Data "${texto}" inválida. Use AAAA-MM ou AAAA-MM-DD.`);
  process.exit(1);
}

const inicio = inicioDe(desdeArg);
const fim = new Date();

console.log(`Conta:    ${conta.nome} (${conta.slug})`);
console.log(`Período:  ${inicio.toLocaleDateString("pt-BR")} até hoje`);
console.log(`Modo:     ${SIMULAR ? "SIMULAÇÃO (não grava)" : "gravando no banco"}`);
console.log("---");

// ------------------------------------------------------------------
// Busca paginada, mês a mês
//
// A busca da API limita o offset, então varrer mês a mês evita esbarrar
// nesse teto em contas com muito movimento.
// ------------------------------------------------------------------
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function buscarJanela(de, ate) {
  const encontrados = [];
  let offset = 0;

  for (;;) {
    const params = new URLSearchParams({
      sort: "date_created",
      criteria: "asc",
      range: "date_created",
      begin_date: de.toISOString(),
      end_date: ate.toISOString(),
      limit: "50",
      offset: String(offset),
    });

    const resposta = await fetch(
      `https://api.mercadopago.com/v1/payments/search?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!resposta.ok) {
      const corpo = await resposta.text();
      throw new Error(`API respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
    }

    const { results = [], paging = {} } = await resposta.json();
    encontrados.push(...results);

    offset += results.length;
    if (results.length === 0 || offset >= (paging.total ?? 0)) break;

    await espera(250); // respeita o limite de requisições da API
  }

  return encontrados;
}

// ------------------------------------------------------------------
// Mapeamento pagamento -> transação
// Espelha src/app/api/webhooks/mercadopago/[conta]/route.ts. Se a regra
// mudar lá, atualize aqui também.
// ------------------------------------------------------------------
function paraTransacao(pagamento) {
  const somosRecebedor =
    !conta.mp_user_id || String(pagamento.collector_id ?? "") === conta.mp_user_id;

  const p = pagamento.payer ?? {};
  const nome = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();

  return {
    conta_id: conta.id,
    tipo: somosRecebedor ? "entrada" : "saida",
    valor: Math.abs(pagamento.transaction_amount ?? 0),
    descricao: pagamento.description ?? null,
    contraparte: nome || p.email || null,
    metodo: pagamento.payment_method_id ?? pagamento.payment_type_id ?? null,
    status: pagamento.status ?? "pending",
    ocorrido_em:
      pagamento.date_approved ?? pagamento.date_created ?? new Date().toISOString(),
    origem: "mercadopago",
    mp_payment_id: String(pagamento.id),
    payload: pagamento,
  };
}

// ------------------------------------------------------------------
// Execução
// ------------------------------------------------------------------
let totalEncontrado = 0;
let totalGravado = 0;
const porStatus = {};
let entradas = 0;
let saidas = 0;

const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());

while (cursor < fim) {
  const proximoMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  const ate = proximoMes < fim ? proximoMes : fim;
  const rotulo = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  let pagamentos;
  try {
    pagamentos = await buscarJanela(cursor, ate);
  } catch (e) {
    console.error(`✗ ${rotulo}: ${e.message}`);
    process.exit(1);
  }

  totalEncontrado += pagamentos.length;

  if (pagamentos.length === 0) {
    console.log(`· ${rotulo}: nenhum pagamento`);
  } else {
    const linhas = pagamentos.map(paraTransacao);

    for (const l of linhas) {
      porStatus[l.status] = (porStatus[l.status] ?? 0) + 1;
      if (l.status === "approved") {
        if (l.tipo === "entrada") entradas += l.valor;
        else saidas += l.valor;
      }
    }

    if (SIMULAR) {
      console.log(`· ${rotulo}: ${linhas.length} pagamento(s) (simulação)`);
    } else {
      const { error } = await admin
        .from("transacoes")
        .upsert(linhas, { onConflict: "mp_payment_id" });

      if (error) {
        console.error(`✗ ${rotulo}: ${error.message}`);
        process.exit(1);
      }
      totalGravado += linhas.length;
      console.log(`✓ ${rotulo}: ${linhas.length} pagamento(s) gravado(s)`);
    }
  }

  cursor.setMonth(cursor.getMonth() + 1);
  cursor.setDate(1);
}

const moeda = (v) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

console.log("---");
console.log(`Pagamentos encontrados: ${totalEncontrado}`);
console.log(`Gravados no banco:      ${SIMULAR ? "0 (simulação)" : totalGravado}`);
console.log(`Por status:             ${JSON.stringify(porStatus)}`);
console.log(`Entradas (aprovadas):   ${moeda(entradas)}`);
console.log(`Saídas (aprovadas):     ${moeda(saidas)}`);
console.log(`Resultado:              ${moeda(entradas - saidas)}`);

if (!SIMULAR) {
  const { data: saldo } = await admin.from("saldo_por_conta").select("*");
  console.log("---");
  for (const s of saldo ?? []) {
    console.log(`${s.conta_nome}: saldo ${moeda(Number(s.saldo))}`);
  }
  console.log("\nAs transações entram sem categoria. Categorize em Transações,");
  console.log("filtrando por «⚠ Sem categoria».");
}
