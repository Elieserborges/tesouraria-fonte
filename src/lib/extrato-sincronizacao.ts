import type { SupabaseClient } from "@supabase/supabase-js";
import {
  baixarRelatorio,
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

/** Não pede um novo relatório se já existe um pedido recente sem resposta. */
const HORAS_ENTRE_PEDIDOS = 6;

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
      const { movimentos } = lerRelatorio(csv);
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

  const { count } = await admin
    .from("extrato_pedidos")
    .select("id", { count: "exact", head: true })
    .eq("conta_id", conta.id)
    .eq("status", "pendente")
    .gte("criado_em", limite);

  // Já tem um pedido recente esperando: pedir de novo só engorda a fila.
  if ((count ?? 0) > 0) return false;

  const fim = new Date();
  const inicio = new Date(fim.getTime() - DIAS_DA_JANELA * 24 * 3600 * 1000);
  const pedido = await pedirRelatorio(token, inicio, fim);

  await admin.from("extrato_pedidos").insert({
    id: pedido.id,
    conta_id: conta.id,
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    status: "pendente",
  });

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
