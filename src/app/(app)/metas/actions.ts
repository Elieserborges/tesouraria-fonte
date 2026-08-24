"use server";

import { revalidatePath } from "next/cache";
import { obterSessao } from "@/lib/supabase/server";
import { podeEditar } from "@/lib/types";

export type EstadoMeta = { erro?: string; sucesso?: string };

async function sessaoEditor() {
  const sessao = await obterSessao();
  if (!sessao) throw new Error("Sessão expirada.");
  if (!podeEditar(sessao.perfil?.papel)) {
    throw new Error("Seu perfil tem acesso apenas de leitura.");
  }
  return sessao;
}

export async function salvarMeta(
  _anterior: EstadoMeta,
  formData: FormData,
): Promise<EstadoMeta> {
  try {
    const { supabase, user } = await sessaoEditor();
    const id = String(formData.get("id") ?? "");

    const dados = {
      categoria_nome: String(formData.get("categoria_nome") ?? "").trim(),
      tipo: String(formData.get("tipo") ?? "entrada"),
      inicio: String(formData.get("inicio") ?? ""),
      fim: String(formData.get("fim") ?? ""),
      valor: Number(
        String(formData.get("valor") ?? "")
          .replace(/^R\$\s*/i, "")
          .replace(/\./g, "")
          .replace(",", "."),
      ),
      observacao: String(formData.get("observacao") ?? "").trim() || null,
    };

    if (!dados.categoria_nome) return { erro: "Escolha a categoria." };
    if (!dados.inicio || !dados.fim) return { erro: "Informe início e fim do período." };
    if (dados.fim < dados.inicio) {
      return { erro: "A data final não pode ser anterior à inicial." };
    }
    if (!Number.isFinite(dados.valor) || dados.valor <= 0) {
      return { erro: "Informe quanto se espera para o período." };
    }

    const { error } = id
      ? await supabase.from("metas").update(dados).eq("id", id)
      : await supabase.from("metas").insert({ ...dados, criado_por: user.id });

    if (error) {
      // A restrição de unicidade é a única que o cadastro pode esbarrar.
      if (error.code === "23505") {
        return {
          erro:
            "Já existe uma meta dessa categoria, desse tipo e nesse mesmo " +
            "período. Edite a que existe em vez de criar outra.",
        };
      }
      return { erro: error.message };
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao salvar a meta." };
  }

  revalidatePath("/metas");
  return { sucesso: "Meta salva." };
}

export async function excluirMeta(id: string): Promise<EstadoMeta> {
  try {
    const { supabase } = await sessaoEditor();
    const { error } = await supabase.from("metas").delete().eq("id", id);
    if (error) return { erro: error.message };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao excluir." };
  }

  revalidatePath("/metas");
  return { sucesso: "Meta excluída. Nenhum lançamento foi afetado." };
}
