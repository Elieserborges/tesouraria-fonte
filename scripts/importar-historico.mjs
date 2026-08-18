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
// Busca: união de repetições + divisão de janelas
//
// Esta API tem dois problemas medidos em testes, e ambos fazem perder
// transações silenciosamente:
//
// 1. Réplicas divergentes. A MESMA consulta alterna entre respostas
//    diferentes — um dia devolveu ora 11, ora 8 pagamentos, sendo o
//    conjunto de 8 um subconjunto do de 11. Solução: repetir a consulta
//    e unir os resultados até parar de aparecer id novo.
//
// 2. Paginação por offset não confiável. `paging.total` varia entre
//    requisições (303 e 179 para a mesma janela), então usá-lo como
//    critério de parada aborta a leitura cedo. Solução: nunca usar
//    offset. Se a página vier cheia, dividir o intervalo ao meio e
//    buscar cada metade, até cada pedaço caber numa página.
// ------------------------------------------------------------------
const LIMITE = 50;
const PROFUNDIDADE_MAX = 14; // ~2 minutos de granularidade a partir de 1 mês
const SEM_NOVIDADE_PARA_PARAR = 2;
const TENTATIVAS_MAX = 6;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let requisicoes = 0;

async function buscarPagina(de, ate) {
  requisicoes += 1;
  const params = new URLSearchParams({
    sort: "date_created",
    criteria: "asc",
    range: "date_created",
    begin_date: de.toISOString(),
    end_date: ate.toISOString(),
    limit: String(LIMITE),
    offset: "0",
  });

  const resposta = await fetch(
    `https://api.mercadopago.com/v1/payments/search?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`API respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
  }

  const { results = [] } = await resposta.json();
  return results;
}

/** Consulta a mesma janela até parar de surgir id novo. */
async function coletarJanela(de, ate) {
  const vistos = new Map();
  let semNovidade = 0;
  let veioCheia = false;

  for (let tentativa = 0; tentativa < TENTATIVAS_MAX; tentativa++) {
    const results = await buscarPagina(de, ate);
    if (results.length >= LIMITE) veioCheia = true;

    let novos = 0;
    for (const p of results) {
      const id = String(p.id);
      if (!vistos.has(id)) {
        vistos.set(id, p);
        novos += 1;
      }
    }

    semNovidade = novos === 0 ? semNovidade + 1 : 0;
    if (semNovidade >= SEM_NOVIDADE_PARA_PARAR) break;

    await espera(150); // respeita o limite de requisições da API
  }

  return { itens: [...vistos.values()], veioCheia };
}

async function buscarJanela(de, ate, profundidade = 0) {
  const { itens, veioCheia } = await coletarJanela(de, ate);

  // Nenhuma resposta encheu a página: a janela coube inteira.
  if (!veioCheia) return itens;

  const meio = new Date(Math.floor((de.getTime() + ate.getTime()) / 2));

  if (profundidade >= PROFUNDIDADE_MAX || meio <= de || meio >= ate) {
    console.warn(
      `! Janela ${de.toISOString()}–${ate.toISOString()} tem mais de ${LIMITE} ` +
        "pagamentos e não pôde ser dividida. Pode haver transações não importadas.",
    );
    return itens;
  }

  // Mantém o que já foi visto e soma as metades — a duplicata é removida depois.
  return [
    ...itens,
    ...(await buscarJanela(de, meio, profundidade + 1)),
    ...(await buscarJanela(meio, ate, profundidade + 1)),
  ];
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
//
// Mesmo com união de repetições, uma passada isolada continua parcial —
// medimos 2061 e 2103 pagamentos em execuções seguidas, e alguns meses
// vinham menores na segunda. Como a gravação é `upsert` por
// mp_payment_id, o banco vai acumulando a união a cada passada.
// Por isso repetimos a varredura inteira até uma passada não trazer
// nenhuma linha nova.
// ------------------------------------------------------------------
const moeda = (v) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PASSADAS_MAX = Number(
  process.argv.find((a) => a.startsWith("--passadas="))?.split("=")[1] ?? 8,
);

async function contarImportadas() {
  const { count } = await admin
    .from("transacoes")
    .select("id", { count: "exact", head: true })
    .eq("origem", "mercadopago")
    .eq("conta_id", conta.id);
  return count ?? 0;
}

async function umaPassada() {
  const stats = { encontrados: 0, porStatus: {}, entradas: 0, saidas: 0 };
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

    if (pagamentos.length > 0) {
      // O Postgres recusa um upsert com o mesmo mp_payment_id duas vezes no
      // mesmo lote, e janelas divididas repetem pagamentos na fronteira.
      const porId = new Map();
      for (const p of pagamentos) porId.set(String(p.id), paraTransacao(p));
      const linhas = [...porId.values()];
      stats.encontrados += linhas.length;

      for (const l of linhas) {
        stats.porStatus[l.status] = (stats.porStatus[l.status] ?? 0) + 1;
        if (l.status === "approved") {
          if (l.tipo === "entrada") stats.entradas += l.valor;
          else stats.saidas += l.valor;
        }
      }

      if (!SIMULAR) {
        // Em lotes, porque cada linha carrega o JSON inteiro do pagamento.
        for (let i = 0; i < linhas.length; i += 200) {
          const { error } = await admin
            .from("transacoes")
            .upsert(linhas.slice(i, i + 200), { onConflict: "mp_payment_id" });

          if (error) {
            console.error(`✗ ${rotulo}: ${error.message}`);
            process.exit(1);
          }
        }
      }
      process.stdout.write(`  ${rotulo}: ${linhas.length}\n`);
    }

    cursor.setMonth(cursor.getMonth() + 1);
    cursor.setDate(1);
  }

  return stats;
}

if (SIMULAR) {
  const stats = await umaPassada();
  console.log("---");
  console.log(`Requisições à API:      ${requisicoes}`);
  console.log(`Pagamentos encontrados: ${stats.encontrados}`);
  console.log(`Por status:             ${JSON.stringify(stats.porStatus)}`);
  console.log(`Entradas (aprovadas):   ${moeda(stats.entradas)}`);
  console.log(`Saídas (aprovadas):     ${moeda(stats.saidas)}`);
  console.log(`Resultado:              ${moeda(stats.entradas - stats.saidas)}`);
  console.log(
    "\nEm simulação roda só uma passada. Uma passada é sempre parcial —\n" +
      "o número real só se estabiliza gravando, porque o banco acumula.",
  );
} else {
  let anterior = await contarImportadas();
  console.log(`Já no banco: ${anterior} transação(ões) desta conta.\n`);

  for (let passada = 1; passada <= PASSADAS_MAX; passada++) {
    console.log(`— passada ${passada} —`);
    await umaPassada();

    const agora = await contarImportadas();
    const novas = agora - anterior;
    anterior = agora;

    console.log(`  → ${novas} nova(s). Total no banco: ${agora}\n`);

    if (novas === 0) {
      console.log(`Convergiu na passada ${passada}: nada de novo apareceu.`);
      break;
    }
    if (passada === PASSADAS_MAX) {
      console.log(
        `Parou no limite de ${PASSADAS_MAX} passadas ainda encontrando novidades.\n` +
          "Rode de novo para continuar acumulando.",
      );
    }
  }

  const { data: saldo } = await admin.from("saldo_por_conta").select("*");
  const { count: semCategoria } = await admin
    .from("transacoes")
    .select("id", { count: "exact", head: true })
    .is("categoria_id", null);

  console.log("---");
  console.log(`Requisições à API: ${requisicoes}`);
  for (const s of saldo ?? []) {
    console.log(
      `${s.conta_nome}: entradas ${moeda(Number(s.entradas))} · ` +
        `saídas ${moeda(Number(s.saidas))} · saldo ${moeda(Number(s.saldo))}`,
    );
  }
  console.log(
    `\n${semCategoria} transação(ões) sem categoria. Classifique em Transações,\n` +
      "filtrando por «⚠ Sem categoria».",
  );
}
