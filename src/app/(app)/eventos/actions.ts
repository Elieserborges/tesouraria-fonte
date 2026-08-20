"use server";

import { revalidatePath } from "next/cache";
import { obterSessao } from "@/lib/supabase/server";
import { podeEditar } from "@/lib/types";

export type EstadoEvento = { erro?: string; sucesso?: string };

async function sessaoEditor() {
  const sessao = await obterSessao();
  if (!sessao) throw new Error("Sessão expirada.");
  if (!podeEditar(sessao.perfil?.papel)) {
    throw new Error("Seu perfil tem acesso apenas de leitura.");
  }
  return sessao;
}

function ler(formData: FormData) {
  return {
    nome: String(formData.get("nome") ?? "").trim(),
    categoria_nome: String(formData.get("categoria_nome") ?? "").trim(),
    inicio: String(formData.get("inicio") ?? ""),
    fim: String(formData.get("fim") ?? ""),
    observacao: String(formData.get("observacao") ?? "").trim() || null,
  };
}

/**
 * Duas edições da mesma categoria não podem se sobrepor: uma transação
 * cairia em ambas e seria contada duas vezes. É a única regra que a janela
 * de datas impõe, então vale barrar na hora do cadastro.
 */
async function janelaLivre(
  supabase: Awaited<ReturnType<typeof obterSessao>> extends null
    ? never
    : NonNullable<Awaited<ReturnType<typeof obterSessao>>>["supabase"],
  categoria: string,
  inicio: string,
  fim: string,
  ignorarId?: string,
) {
  let consulta = supabase
    .from("eventos")
    .select("id, nome, inicio, fim")
    .eq("categoria_nome", categoria)
    .lte("inicio", fim)
    .gte("fim", inicio);

  if (ignorarId) consulta = consulta.neq("id", ignorarId);

  const { data } = await consulta;
  return data?.[0] ?? null;
}

export async function salvarEvento(
  _anterior: EstadoEvento,
  formData: FormData,
): Promise<EstadoEvento> {
  try {
    const { supabase, user } = await sessaoEditor();
    const id = String(formData.get("id") ?? "");
    const dados = ler(formData);

    if (!dados.nome) return { erro: "Dê um nome à edição — ex.: Face a Face Homens · Ago/2026." };
    if (!dados.categoria_nome) return { erro: "Escolha a categoria do evento." };
    if (!dados.inicio || !dados.fim) return { erro: "Informe início e fim da janela." };
    if (dados.fim < dados.inicio) {
      return { erro: "A data final não pode ser anterior à inicial." };
    }

    const conflito = await janelaLivre(
      supabase,
      dados.categoria_nome,
      dados.inicio,
      dados.fim,
      id || undefined,
    );
    if (conflito) {
      return {
        erro:
          `A janela se sobrepõe à edição "${conflito.nome}" ` +
          `(${conflito.inicio} a ${conflito.fim}). Ajuste as datas para não ` +
          "contar a mesma transação duas vezes.",
      };
    }

    const { error } = id
      ? await supabase.from("eventos").update(dados).eq("id", id)
      : await supabase.from("eventos").insert({ ...dados, criado_por: user.id });

    if (error) return { erro: error.message };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao salvar a edição." };
  }

  revalidatePath("/eventos");
  return { sucesso: "Edição salva." };
}

export async function excluirEvento(id: string): Promise<EstadoEvento> {
  try {
    const { supabase } = await sessaoEditor();
    const { error } = await supabase.from("eventos").delete().eq("id", id);
    if (error) return { erro: error.message };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao excluir." };
  }

  revalidatePath("/eventos");
  return {
    sucesso: "Edição excluída. As transações continuam no sistema, só deixam de ser agrupadas.",
  };
}
