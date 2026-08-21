"use server";

import { revalidatePath } from "next/cache";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { lerExtratoDeConta } from "@/lib/extrato-csv";
import { obterSessao } from "@/lib/supabase/server";
import { nomeUtil, podeEditar } from "@/lib/types";

export type ResultadoImportacao = {
  erro?: string;
  periodo?: string;
  movimentos?: number;
  nomes?: number;
  valores?: number;
  criados?: number;
  saldoDoExtrato?: number;
};

/**
 * Lê um extrato baixado do painel e melhora o que está gravado.
 *
 * Três coisas, nesta ordem de importância:
 *
 *  1. Nomes. É o único motivo pelo qual este arquivo ainda existe — o nome de
 *     quem paga por Pix não vem por API nenhuma.
 *  2. Valores. Onde o extrato discorda, ele manda: é o razão do banco.
 *  3. Movimentos que faltavam.
 *
 * O que NÃO faz: apagar ou neutralizar nada. Uma tela onde qualquer pessoa
 * arrasta um arquivo não é lugar para remover lançamento — para isso existe o
 * script de conciliação, que mostra o efeito antes de aplicar.
 */
export async function importarExtrato(
  _anterior: ResultadoImportacao,
  form: FormData,
): Promise<ResultadoImportacao> {
  const sessao = await obterSessao();
  if (!sessao) return { erro: "Sessão expirada." };
  if (!podeEditar(sessao.perfil?.papel)) {
    return { erro: "Seu perfil tem acesso apenas de leitura." };
  }

  const arquivo = form.get("extrato");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o arquivo CSV do extrato." };
  }

  let extrato;
  try {
    extrato = lerExtratoDeConta(await arquivo.text());
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não consegui ler o arquivo." };
  }

  const admin = criarClienteAdmin();

  const { data: conta } = await admin
    .from("contas")
    .select("id")
    .eq("slug", "conta-1")
    .single();

  if (!conta) return { erro: "Conta do Mercado Pago não encontrada." };

  // O que já existe, consultado em blocos: o `in` do PostgREST não aceita uma
  // lista arbitrariamente longa, e um extrato mensal passa de 300 linhas.
  const ids = extrato.movimentos.map((m) => m.id);
  const existentes = new Map<
    string,
    { id: string; valor: number; tipo: string; contraparte: string | null }
  >();

  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin
      .from("transacoes")
      .select("id, valor, tipo, contraparte, mp_payment_id")
      .in("mp_payment_id", ids.slice(i, i + 300));

    for (const linha of data ?? []) {
      existentes.set(String(linha.mp_payment_id), {
        id: String(linha.id),
        valor: Number(linha.valor),
        tipo: String(linha.tipo),
        contraparte: linha.contraparte as string | null,
      });
    }
  }

  let nomes = 0;
  let valores = 0;
  const novos: Record<string, unknown>[] = [];

  for (const m of extrato.movimentos) {
    const tipo = m.liquido >= 0 ? "entrada" : "saida";
    const valor = Number(Math.abs(m.liquido).toFixed(2));
    const atual = existentes.get(m.id);

    if (!atual) {
      novos.push({
        conta_id: conta.id,
        tipo,
        valor,
        valor_bruto: valor,
        tarifa: 0,
        descricao: m.descricao,
        contraparte: m.nome,
        status: "approved",
        ocorrido_em: m.ocorridoEm,
        origem: "mercadopago",
        mp_payment_id: m.id,
      });
      continue;
    }

    const mudanca: Record<string, unknown> = {};

    // O nome só entra onde não há um bom: o que a tesouraria digitou à mão
    // vale mais que o do extrato.
    if (m.nome && !nomeUtil(atual.contraparte)) {
      mudanca.contraparte = m.nome;
      nomes += 1;
    }

    if (Math.abs(atual.valor - valor) > 0.005 || atual.tipo !== tipo) {
      mudanca.valor = valor;
      mudanca.tipo = tipo;
      valores += 1;
    }

    if (Object.keys(mudanca).length > 0) {
      await admin.from("transacoes").update(mudanca).eq("id", atual.id);
    }
  }

  for (let i = 0; i < novos.length; i += 500) {
    const { error } = await admin
      .from("transacoes")
      .upsert(novos.slice(i, i + 500), { onConflict: "mp_payment_id" });
    if (error) return { erro: `Falha ao gravar: ${error.message}` };
  }

  // Nome novo pode revelar uma regra que já existia para aquela pessoa.
  await admin.rpc("aplicar_regras_categoria");

  const paraBR = (dia: string) => dia.split("-").reverse().join("/");

  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
  revalidatePath("/relatorios");
  revalidatePath("/exportar");

  return {
    periodo: `${paraBR(extrato.de)} a ${paraBR(extrato.ate)}`,
    movimentos: extrato.movimentos.length,
    nomes,
    valores,
    criados: novos.length,
    saldoDoExtrato: extrato.final,
  };
}
