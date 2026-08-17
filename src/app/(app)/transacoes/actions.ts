"use server";

import { revalidatePath } from "next/cache";
import { obterSessao } from "@/lib/supabase/server";
import { podeEditar } from "@/lib/types";

export type EstadoFormulario = { erro?: string; sucesso?: string };

async function sessaoEditor() {
  const sessao = await obterSessao();
  if (!sessao) throw new Error("Sessão expirada.");
  if (!podeEditar(sessao.perfil?.papel)) {
    throw new Error("Seu perfil tem acesso apenas de leitura.");
  }
  return sessao;
}

/** Atribui (ou remove) a categoria de uma transação. */
export async function atribuirCategoria(
  transacaoId: string,
  categoriaId: string | null,
): Promise<EstadoFormulario> {
  try {
    const { supabase } = await sessaoEditor();
    const { error } = await supabase
      .from("transacoes")
      .update({ categoria_id: categoriaId })
      .eq("id", transacaoId);

    if (error) return { erro: error.message };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao categorizar." };
  }

  revalidatePath("/transacoes");
  revalidatePath("/dashboard");
  return { sucesso: "Categoria atualizada." };
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
