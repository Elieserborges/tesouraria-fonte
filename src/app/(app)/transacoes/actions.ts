"use server";

import { revalidatePath } from "next/cache";
import { obterSessao } from "@/lib/supabase/server";
import { padraoDaTransacao, podeEditar } from "@/lib/types";

export type EstadoFormulario = { erro?: string; sucesso?: string };

/** Resultado de categorizar: quantas outras transações foram junto. */
export type ResultadoCategoria = EstadoFormulario & {
  tambem?: number;
  /** true quando a transacao nao tem descricao e por isso nao gerou regra. */
  semRegra?: boolean;
};

async function sessaoEditor() {
  const sessao = await obterSessao();
  if (!sessao) throw new Error("Sessão expirada.");
  if (!podeEditar(sessao.perfil?.papel)) {
    throw new Error("Seu perfil tem acesso apenas de leitura.");
  }
  return sessao;
}

/**
 * Atribui (ou remove) a categoria de uma transação.
 *
 * Ao definir uma categoria, guarda a regra "descrição + tipo => categoria"
 * e aplica às demais transações iguais que ainda estão sem categoria.
 * Nunca sobrescreve uma classificação feita à mão.
 */
export async function atribuirCategoria(
  transacaoId: string,
  categoriaId: string | null,
  criarRegra = true,
): Promise<ResultadoCategoria> {
  let tambem = 0;
  let semRegra = false;

  try {
    const { supabase, user } = await sessaoEditor();

    const { data: transacao, error: erroBusca } = await supabase
      .from("transacoes")
      .select("id, tipo, descricao, contraparte")
      .eq("id", transacaoId)
      .single();

    if (erroBusca || !transacao) return { erro: "Transação não encontrada." };

    // A escolha desta linha é sempre manual — não pode ser desfeita por regra.
    const { error } = await supabase
      .from("transacoes")
      .update({ categoria_id: categoriaId, categoria_automatica: false })
      .eq("id", transacaoId);

    if (error) return { erro: error.message };

    // Casa pela descrição quando existe; senão pelo nome de quem pagou.
    // Sem nenhum dos dois não há regra — um padrão vazio casaria com toda
    // transação sem descrição, e uma vez isso arrastou 392 lançamentos
    // (R$ 54 mil) para a categoria errada.
    const alvo = padraoDaTransacao(transacao);
    semRegra = Boolean(categoriaId) && criarRegra && alvo === null;

    if (categoriaId && criarRegra && alvo) {
      const { padrao, modo, campo } = alvo;

      const { error: erroRegra } = await supabase
        .from("regras_categoria")
        .upsert(
          {
            padrao,
            modo,
            campo,
            tipo: transacao.tipo,
            categoria_id: categoriaId,
            criado_por: user.id,
          },
          { onConflict: "padrao,tipo,modo,campo" },
        );

      if (erroRegra) return { erro: erroRegra.message };

      const { data: aplicadas, error: erroAplicar } = await supabase.rpc(
        "aplicar_regras_categoria",
      );

      if (erroAplicar) return { erro: erroAplicar.message };
      tambem = Number(aplicadas ?? 0);
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao categorizar." };
  }

  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
  revalidatePath("/categorias");
  return { sucesso: "Categoria atualizada.", tambem, semRegra };
}

/** Lançamento manual (saídas em dinheiro, ajustes, saldo inicial). */
export async function criarTransacao(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  try {
    const { supabase, user } = await sessaoEditor();

    const tipo = String(formData.get("tipo") ?? "");
    const valorBruto = String(formData.get("valor") ?? "").replace(",", ".");
    const valor = Number(valorBruto);
    const ocorridoEm = String(formData.get("ocorrido_em") ?? "");
    const contaId = String(formData.get("conta_id") ?? "");
    const categoriaId = String(formData.get("categoria_id") ?? "");
    const descricao = String(formData.get("descricao") ?? "").trim();

    if (tipo !== "entrada" && tipo !== "saida") {
      return { erro: "Selecione se é entrada ou saída." };
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      return { erro: "Informe um valor maior que zero." };
    }
    if (!ocorridoEm) {
      return { erro: "Informe a data da movimentação." };
    }

    const { error } = await supabase.from("transacoes").insert({
      tipo,
      valor,
      descricao: descricao || null,
      conta_id: contaId || null,
      categoria_id: categoriaId || null,
      ocorrido_em: new Date(ocorridoEm).toISOString(),
      origem: "manual",
      status: "approved",
      criado_por: user.id,
    });

    if (error) return { erro: error.message };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao lançar." };
  }

  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
  return { sucesso: "Lançamento registrado." };
}

/** Exclui um lançamento manual. Transações vindas do Mercado Pago não são apagadas. */
export async function excluirTransacao(
  transacaoId: string,
): Promise<EstadoFormulario> {
  try {
    const { supabase } = await sessaoEditor();
    const { error } = await supabase
      .from("transacoes")
      .delete()
      .eq("id", transacaoId)
      .eq("origem", "manual");

    if (error) return { erro: error.message };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao excluir." };
  }

  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
  return { sucesso: "Lançamento excluído." };
}
