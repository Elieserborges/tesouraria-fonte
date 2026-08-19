"use server";

import { revalidatePath } from "next/cache";
import { obterSessao } from "@/lib/supabase/server";
import { podeEditar, type CampoRegra, type ModoRegra } from "@/lib/types";

export type EstadoCategoria = { erro?: string; sucesso?: string };

async function sessaoEditor() {
  const sessao = await obterSessao();
  if (!sessao) throw new Error("Sessão expirada.");
  if (!podeEditar(sessao.perfil?.papel)) {
    throw new Error("Seu perfil tem acesso apenas de leitura.");
  }
  return sessao;
}

export async function criarCategoria(
  _anterior: EstadoCategoria,
  formData: FormData,
): Promise<EstadoCategoria> {
  try {
    const { supabase } = await sessaoEditor();

    const nome = String(formData.get("nome") ?? "").trim();
    const tipo = String(formData.get("tipo") ?? "");
    const cor = String(formData.get("cor") ?? "#20A979");
    const ehTransferencia = formData.get("eh_transferencia") === "1";

    if (!nome) return { erro: "Informe o nome da categoria." };
    if (tipo !== "entrada" && tipo !== "saida") {
      return { erro: "Selecione se é categoria de entrada ou de saída." };
    }

    const { error } = await supabase
      .from("categorias")
      .insert({ nome, tipo, cor, eh_transferencia: ehTransferencia });
    if (error) {
      return {
        erro: error.code === "23505"
          ? "Já existe uma categoria com esse nome e tipo."
          : error.message,
      };
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao criar categoria." };
  }

  revalidatePath("/categorias");
  revalidatePath("/transacoes");
  return { sucesso: "Categoria criada." };
}

/**
 * Ajusta o padrão de uma regra e reaplica.
 * Encurtar o padrão e usar o modo "contém" é o que faz uma regra pegar
 * descrições que variam no fim, como o nome de quem comprou.
 */
export async function atualizarRegra(
  regraId: string,
  padrao: string,
  modo: ModoRegra,
  campo: CampoRegra = "descricao",
): Promise<EstadoCategoria & { aplicadas?: number }> {
  let aplicadas = 0;
  try {
    const { supabase } = await sessaoEditor();

    const limpo = padrao.trim().toLowerCase();
    if (modo === "contem" && limpo.length < 3) {
      return { erro: "Para casar por trecho, use ao menos 3 caracteres." };
    }

    const { error } = await supabase
      .from("regras_categoria")
      .update({ padrao: limpo, modo, campo })
      .eq("id", regraId);

    if (error) {
      return {
        erro: error.code === "23505"
          ? "Já existe uma regra com esse padrão."
          : error.message,
      };
    }

    const { data, error: erroAplicar } = await supabase.rpc("aplicar_regras_categoria");
    if (erroAplicar) return { erro: erroAplicar.message };
    aplicadas = Number(data ?? 0);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao atualizar a regra." };
  }

  revalidatePath("/categorias");
  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
  return {
    sucesso: aplicadas
      ? `Regra atualizada. ${aplicadas} transação(ões) categorizadas.`
      : "Regra atualizada. Nenhuma transação nova foi alcançada.",
    aplicadas,
  };
}

/**
 * Remove uma regra de categorização automática.
 * Com `limpar`, tira também a categoria das transações que a regra aplicou —
 * as classificadas à mão permanecem intactas.
 */
export async function removerRegra(
  regraId: string,
  limpar = true,
): Promise<EstadoCategoria & { limpas?: number }> {
  let limpas = 0;
  try {
    const { supabase } = await sessaoEditor();
    const { data, error } = await supabase.rpc("remover_regra_categoria", {
      regra_id: regraId,
      limpar,
    });
    if (error) return { erro: error.message };
    limpas = Number(data ?? 0);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao remover a regra." };
  }

  revalidatePath("/categorias");
  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
  return {
    sucesso: limpar
      ? `Regra removida. ${limpas} transação(ões) voltaram a ficar sem categoria.`
      : "Regra removida. As transações mantiveram a categoria.",
    limpas,
  };
}

/** Remove a categoria. As transações ligadas a ela ficam "sem categoria". */
export async function excluirCategoria(id: string): Promise<EstadoCategoria> {
  try {
    const { supabase } = await sessaoEditor();
    const { error } = await supabase.from("categorias").delete().eq("id", id);
    if (error) return { erro: error.message };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao excluir." };
  }

  revalidatePath("/categorias");
  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
  return { sucesso: "Categoria excluída." };
}
