import type { SupabaseClient } from "@supabase/supabase-js";
import {
  agruparMovimentos,
  baixarRelatorio,
  janelaDeDias,
  lerRelatorio,
  pedirRelatorio,
  relatorioPronto,
  rotuloDoMovimento,
  type MovimentoExtrato,
} from "./mercadopago-extrato";

/*
 * Conciliação com o extrato do Mercado Pago.
 *
 * A API de pagamentos não vê saque, Pix enviado nem cofrinho, e devolve o
 * valor bruto. O extrato vê tudo e já vem líquido. Aqui ele manda: onde o
 * movimento já existe, corrige o valor; onde não existe, cria.
 *
 * O relatório demora alguns minutos para ficar pronto, então o ciclo tem duas
 * metades que rodam em execuções diferentes do cron.
 */

/** Quantos dias para trás cada pedido cobre. Sobra folga para reprocessar. */
const DIAS_DA_JANELA = 15;

/*
 * Intervalo mínimo entre dois pedidos de relatório.
 *
 * A janela pedida cobre 15 dias, então um pedido por dia já reprocessa tudo
 * com folga. Pedir mais que isso não traz nada de novo e gasta a cota da API
 * — que tem limite, como descobrimos pelos 429.
 */
const HORAS_ENTRE_PEDIDOS = 24;

type Conta = { id: string; slug: string };

export type ResultadoExtrato = {
  pedidos: number;
  importados: number;
  criados: number;
  corrigidos: number;
  pendentes: number;
};

/**
 * Metade 1: busca os pedidos que já ficaram prontos e aplica no banco.
 */
export async function importarRelatoriosProntos(
  admin: SupabaseClient,
  conta: Conta,
  token: string,
): Promise<{ importados: number; criados: number; corrigidos: number; pendentes: number }> {
  const { data: pendentes } = await admin
    .from("extrato_pedidos")
    .select("id, inicio, fim")
    .eq("conta_id", conta.id)
    .eq("status", "pendente")
    .order("criado_em", { ascending: true });

  // Arquivos que outro pedido já consumiu: dois períodos iguais gerariam
  // arquivos distintos, e importar o mesmo duas vezes não quebra nada, mas
  // deixaria um pedido pendente para sempre.
  const { data: usados } = await admin
    .from("extrato_pedidos")
    .select("arquivo")
    .eq("conta_id", conta.id)
    .not("arquivo", "is", null);

  const jaImportados = new Set((usados ?? []).map((u) => String(u.arquivo)));

  let importados = 0;
  let criados = 0;
  let corrigidos = 0;
  let aindaNaFila = 0;

  for (const pedido of pendentes ?? []) {
    const arquivo = await relatorioPronto(token, pedido.inicio, pedido.fim, jaImportados);

    if (!arquivo) {
      aindaNaFila += 1;
      continue;
    }

    try {
      const csv = await baixarRelatorio(token, arquivo.file_name);
      // Uma operação pode ocupar várias linhas do relatório; aqui elas viram
      // um movimento só, com o efeito somado.
      const movimentos = agruparMovimentos(lerRelatorio(csv).movimentos);
      const efeito = await aplicarMovimentos(admin, conta, movimentos);

      criados += efeito.criados;
      corrigidos += efeito.corrigidos;
      importados += 1;
      jaImportados.add(arquivo.file_name);

      await admin
        .from("extrato_pedidos")
        .update({
          status: "importado",
          arquivo: arquivo.file_name,
          movimentos: movimentos.length,
          importado_em: new Date().toISOString(),
        })
        .eq("id", pedido.id);
    } catch (e) {
      await admin
        .from("extrato_pedidos")
        .update({
          status: "erro",
          detalhe: e instanceof Error ? e.message : "erro desconhecido",
        })
        .eq("id", pedido.id);
    }
  }

  return { importados, criados, corrigidos, pendentes: aindaNaFila };
}

/**
 * Metade 2: coloca a janela recente na fila, para a próxima execução buscar.
 */
export async function pedirProximoRelatorio(
  admin: SupabaseClient,
  conta: Conta,
  token: string,
): Promise<boolean> {
  const limite = new Date(Date.now() - HORAS_ENTRE_PEDIDOS * 3600 * 1000).toISOString();

  /*
   * O freio olha qualquer pedido recente, não só os que ainda esperam.
   *
   * Filtrando por `pendente`, o freio nunca pegava: o relatório costuma ficar
   * pronto antes da execução seguinte, o pedido vira `importado`, e a busca
   * por pendentes volta vazia. O cron pediu um relatório a cada 15 minutos
   * por semanas — 454 no total — até o Mercado Pago passar a responder 429 e
   * a sincronização do extrato morrer em silêncio.
   */
  /*
   * Lê a linha mais recente em vez de contar, e trava quando não consegue ler.
   *
   * A contagem vinha por uma requisição HEAD, e em produção o freio seguiu
   * deixando passar vários pedidos por dia — com a mesma consulta devolvendo
   * 8 quando rodada fora da Vercel. Uma contagem que chega vazia vira zero e
   * libera o pedido; um erro, também. Ler a linha não depende de cabeçalho, e
   * se a consulta falhar o cron simplesmente não pede: um dia sem extrato novo
   * custa menos do que estourar a cota do Mercado Pago de novo.
   */
  const { data: recentes, error: erroFreio } = await admin
    .from("extrato_pedidos")
    .select("id, criado_em")
    .eq("conta_id", conta.id)
    .gte("criado_em", limite)
    .order("criado_em", { ascending: false })
    .limit(1);

  if (erroFreio) {
    console.warn("[extrato] freio sem resposta, pedido adiado: " + erroFreio.message);
    return false;
  }

  const ultimo = recentes?.[0];
  if (ultimo) {
    console.log("[extrato] freio: último pedido em " + ultimo.criado_em + ", nada a pedir");
    return false;
  }

  const agora = new Date();
  const inicio = new Date(agora.getTime() - DIAS_DA_JANELA * 24 * 3600 * 1000);
  let pedido;
  try {
    pedido = await pedirRelatorio(token, inicio, agora);
  } catch (e) {
    /*
     * Cota estourada não é falha do sistema: o relatório anterior ainda vale,
     * e a próxima execução tenta de novo. Registrar como erro só enterraria
     * os problemas de verdade num log cheio de ruído.
     */
    if (e instanceof Error && e.message.includes("429")) return false;
    throw e;
  }

  // Guarda a janela arredondada, não a que pedimos: é ela que volta na
  // listagem, e é por ela que o arquivo vai ser reconhecido depois.
  const janela = janelaDeDias(inicio, agora);

  const { error: erroGravacao } = await admin.from("extrato_pedidos").insert({
    id: pedido.id,
    conta_id: conta.id,
    inicio: janela.begin_date,
    fim: janela.end_date,
    status: "pendente",
  });

  /*
   * Todo pedido feito fica registrado.
   *
   * É o jeito de conferir, olhando o banco, que o freio segura: mais de uma
   * linha destas por dia significa que ele voltou a falhar. E um pedido aceito
   * pelo Mercado Pago que não chega a ser gravado gasta cota sem deixar rastro
   * nenhum — melhor que apareça.
   */
  await admin.from("webhook_eventos").insert({
    conta_slug: conta.slug,
    tipo: "extrato",
    recurso_id: String(pedido.id),
    status: erroGravacao ? "erro" : "processado",
    detalhe: erroGravacao
      ? "Pedido aceito pelo Mercado Pago e não gravado: " + erroGravacao.message
      : "Pedido de extrato de " +
        janela.begin_date.slice(0, 10) +
        " a " +
        janela.end_date.slice(0, 10),
  });

  console.log("[extrato] pedido " + pedido.id + " feito");
  return true;
}

/**
 * Grava os movimentos do extrato.
 *
 * Onde a transação já existe (veio do webhook ou da API), só os números são
 * atualizados — descrição, categoria e nome do pagador ficam como estão,
 * porque a API descreve melhor do que o extrato.
 */
export async function aplicarMovimentos(
  admin: SupabaseClient,
  conta: Conta,
  movimentos: MovimentoExtrato[],
): Promise<{ criados: number; corrigidos: number }> {
  if (movimentos.length === 0) return { criados: 0, corrigidos: 0 };

  const ids = movimentos.map((m) => m.id);
  const existentes = new Map<string, { id: string; valor: number; tipo: string }>();

  // O PostgREST corta em 1000 linhas por requisição; o `in` também não aceita
  // uma lista arbitrariamente longa. Consultar em blocos resolve os dois.
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin
      .from("transacoes")
      .select("id, valor, tipo, mp_payment_id")
      .eq("conta_id", conta.id)
      .in("mp_payment_id", ids.slice(i, i + 300));

    for (const linha of data ?? []) {
      existentes.set(String(linha.mp_payment_id), {
        id: String(linha.id),
        valor: Number(linha.valor),
        tipo: String(linha.tipo),
      });
    }
  }

  const novos: Record<string, unknown>[] = [];
  let corrigidos = 0;

  for (const m of movimentos) {
    const tipo = m.liquido >= 0 ? "entrada" : "saida";
    const valor = Number(Math.abs(m.liquido).toFixed(2));
    const bruto = m.bruto > 0 ? m.bruto : valor;
    const jaTem = existentes.get(m.id);

    if (!jaTem) {
      novos.push({
        conta_id: conta.id,
        tipo,
        valor,
        valor_bruto: bruto,
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

    const mudouValor = Math.abs(jaTem.valor - valor) > 0.005;
    const mudouTipo = jaTem.tipo !== tipo;
    if (!mudouValor && !mudouTipo) continue;

    await admin
      .from("transacoes")
      .update({ valor, valor_bruto: bruto, tarifa: Number(m.tarifa.toFixed(2)), tipo })
      .eq("id", jaTem.id);

    // O mapa precisa acompanhar o que já foi gravado: comparar contra o
    // valor original faria a linha seguinte parecer inalterada.
    jaTem.valor = valor;
    jaTem.tipo = tipo;
    corrigidos += 1;
  }

  for (let i = 0; i < novos.length; i += 500) {
    await admin
      .from("transacoes")
      .upsert(novos.slice(i, i + 500), { onConflict: "mp_payment_id" });
  }

  return { criados: novos.length, corrigidos };
}

/*
 * Pagamentos que ainda podem mudar de status.
 *
 * A varredura normal do cron olha só as últimas 24 horas. Um pagamento que
 * muda depois disso — um cartão que é capturado dias depois, um ingresso
 * cancelado na semana seguinte — nunca mais seria revisitado, e ficaria
 * congelado no status errado para sempre.
 *
 * Estes estados são os que ainda não são finais. `approved`, `rejected`,
 * `refunded` e `cancelled` não voltam atrás, então saem da lista.
 */
const ESTADOS_ABERTOS = ["pending", "authorized", "in_process", "in_mediation"];

/** Quantos revisitar por execução. O cron roda a cada 15 minutos, então
 *  mesmo um punhado por vez dá conta da fila rapidamente. */
const REVISITAS_POR_EXECUCAO = 40;

export async function revisitarPendentes(
  admin: SupabaseClient,
  conta: { id: string; mp_user_id?: string | null },
  token: string,
  buscarPagamento: (id: string, token: string) => Promise<unknown>,
  paraTransacao: (conta: { id: string; mp_user_id?: string | null }, p: never) => Record<string, unknown>,
): Promise<{ revisitados: number; mudaram: number }> {
  const { data: abertos } = await admin
    .from("transacoes")
    .select("id, status, mp_payment_id")
    .eq("conta_id", conta.id)
    .in("status", ESTADOS_ABERTOS)
    .not("mp_payment_id", "is", null)
    .order("ocorrido_em", { ascending: true })
    .limit(REVISITAS_POR_EXECUCAO);

  let mudaram = 0;

  for (const linha of abertos ?? []) {
    const id = String(linha.mp_payment_id);
    // As linhas criadas a partir do extrato não têm id de pagamento válido
    // na API; tentar buscá-las só gera 404.
    if (!/^\d+$/.test(id)) continue;

    try {
      const pagamento = await buscarPagamento(id, token);
      const registro = paraTransacao(conta, pagamento as never);
      if (registro.status === linha.status) continue;

      await admin.from("transacoes").update(registro).eq("id", linha.id);
      mudaram += 1;
    } catch {
      // Pagamento sumido ou fora do alcance do token: deixa como está.
      // Insistir a cada 15 minutos não melhora nada.
    }
  }

  return { revisitados: (abertos ?? []).length, mudaram };
}
