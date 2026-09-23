"use server";

import { revalidatePath } from "next/cache";
import { obterSessao } from "@/lib/supabase/server";
import { MINIMO_CARTAO, podeEditar } from "@/lib/types";

export type EstadoKanban = { erro?: string; sucesso?: string };

async function sessaoEditor() {
  const sessao = await obterSessao();
  if (!sessao) throw new Error("Sessão expirada.");
  if (!podeEditar(sessao.perfil?.papel)) {
    throw new Error("Seu perfil tem acesso apenas de leitura.");
  }
  return sessao;
}

/** "R$ 1.250,90" vira 1250.9. Vazio vira nulo: nem todo cartão tem valor. */
function paraNumero(bruto: FormDataEntryValue | null): number | null {
  const texto = String(bruto ?? "")
    .replace(/^R\$\s*/i, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  if (!texto) return null;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

export async function salvarCartao(formData: FormData): Promise<EstadoKanban> {
  try {
    const { supabase, user } = await sessaoEditor();
    const id = String(formData.get("id") ?? "");
    const etapaId = String(formData.get("etapa_id") ?? "");
    const titulo = String(formData.get("titulo") ?? "").trim();
    const responsavel = String(formData.get("responsavel") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();

    if (!etapaId) return { erro: "Escolha a etapa do cartão." };

    /*
     * Três caracteres, no mínimo.
     *
     * Campo obrigatório que aceita qualquer coisa vira campo com um ponto
     * dentro: quem tem pressa preenche "x" e segue. Com três letras não dá
     * para escapar sem escrever ao menos um começo de nome.
     */
    if (titulo.length < MINIMO_CARTAO) {
      return { erro: `O título precisa de pelo menos ${MINIMO_CARTAO} caracteres.` };
    }
    /*
     * Sem dono, o cartão só acumula. A exigência vale aqui e não no banco
     * porque os cartões criados antes desta regra continuam válidos — eles
     * pedem um responsável na próxima vez que forem editados.
     */
    if (responsavel.length < MINIMO_CARTAO) {
      return {
        erro: `Diga quem é o responsável — pelo menos ${MINIMO_CARTAO} caracteres.`,
      };
    }
    /*
     * O motivo é o que sobra quando o cartão anda de mão em mão: seis meses
     * depois ninguém lembra por que "Cadeiras" entrou na fila, e quem for
     * aprovar precisa disso mais do que do título.
     */
    if (motivo.length < MINIMO_CARTAO) {
      return {
        erro: `Escreva o motivo do cartão — pelo menos ${MINIMO_CARTAO} caracteres.`,
      };
    }

    const dados = {
      etapa_id: etapaId,
      titulo,
      valor: paraNumero(formData.get("valor")),
      responsavel,
      prazo: String(formData.get("prazo") ?? "") || null,
      categoria_nome: String(formData.get("categoria_nome") ?? "").trim() || null,
      // A coluna guarda o motivo; o nome antigo ficou para não exigir migração.
      observacao: motivo,
    };

    if (id) {
      const { error } = await supabase.from("kanban_cartoes").update(dados).eq("id", id);
      if (error) return { erro: error.message };
    } else {
      // Cartão novo entra no pé da coluna, que é onde a mão vai procurá-lo.
      const { data: ultimo } = await supabase
        .from("kanban_cartoes")
        .select("ordem")
        .eq("etapa_id", etapaId)
        .order("ordem", { ascending: false })
        .limit(1);

      const { error } = await supabase.from("kanban_cartoes").insert({
        ...dados,
        ordem: (ultimo?.[0]?.ordem ?? -1) + 1,
        criado_por: user.id,
      });
      if (error) return { erro: error.message };
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao salvar o cartão." };
  }

  revalidatePath("/kanban");
  return { sucesso: "Cartão salvo." };
}

export async function excluirCartao(id: string): Promise<EstadoKanban> {
  try {
    const { supabase } = await sessaoEditor();
    const { error } = await supabase.from("kanban_cartoes").delete().eq("id", id);
    if (error) return { erro: error.message };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao excluir o cartão." };
  }

  revalidatePath("/kanban");
  return { sucesso: "Cartão excluído." };
}

/**
 * Leva o cartão para outra coluna, ou para outro lugar na mesma.
 *
 * `antesDe` é o cartão que vai ficar logo abaixo dele; sem ele, o cartão vai
 * para o fim. A coluna de destino é reescrita inteira em vez de empurrar as
 * posições uma a uma: são poucos cartões, e assim nunca sobra buraco nem
 * empate de ordem depois de arrastar várias vezes.
 */
export async function moverCartao(
  id: string,
  etapaId: string,
  antesDe: string | null,
): Promise<EstadoKanban> {
  try {
    const { supabase } = await sessaoEditor();

    const { data: destino, error: erroLista } = await supabase
      .from("kanban_cartoes")
      .select("id")
      .eq("etapa_id", etapaId)
      .order("ordem")
      .order("criado_em");
    if (erroLista) return { erro: erroLista.message };

    const restantes = (destino ?? [])
      .map((c) => c.id as string)
      .filter((outro) => outro !== id);
    const posicao = antesDe ? restantes.indexOf(antesDe) : -1;
    const nova = [...restantes];
    nova.splice(posicao >= 0 ? posicao : nova.length, 0, id);

    for (const [indice, cartaoId] of nova.entries()) {
      const campos =
        cartaoId === id ? { etapa_id: etapaId, ordem: indice } : { ordem: indice };
      const { error } = await supabase
        .from("kanban_cartoes")
        .update(campos)
        .eq("id", cartaoId);
      if (error) return { erro: error.message };
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao mover o cartão." };
  }

  revalidatePath("/kanban");
  return {};
}

export async function salvarEtapa(formData: FormData): Promise<EstadoKanban> {
  try {
    const { supabase } = await sessaoEditor();
    const id = String(formData.get("id") ?? "");
    const nome = String(formData.get("nome") ?? "").trim();
    const cor = String(formData.get("cor") ?? "").trim() || "#6366f1";

    if (!nome) return { erro: "A etapa precisa de um nome." };

    if (id) {
      const { error } = await supabase
        .from("kanban_etapas")
        .update({ nome, cor })
        .eq("id", id);
      if (error) return { erro: error.message };
    } else {
      const { data: ultima } = await supabase
        .from("kanban_etapas")
        .select("ordem")
        .order("ordem", { ascending: false })
        .limit(1);

      const { error } = await supabase
        .from("kanban_etapas")
        .insert({ nome, cor, ordem: (ultima?.[0]?.ordem ?? -1) + 1 });
      if (error) return { erro: error.message };
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao salvar a etapa." };
  }

  revalidatePath("/kanban");
  return { sucesso: "Etapa salva." };
}

/**
 * Apaga a etapa — só se estiver vazia.
 *
 * No banco a exclusão levaria os cartões junto, por causa do `on delete
 * cascade`. Perder o trabalho dos outros por um clique não é aceitável, então
 * quem quiser apagar precisa antes esvaziar a coluna.
 */
export async function excluirEtapa(id: string): Promise<EstadoKanban> {
  try {
    const { supabase } = await sessaoEditor();

    const { count, error: erroContagem } = await supabase
      .from("kanban_cartoes")
      .select("id", { count: "exact", head: true })
      .eq("etapa_id", id);
    if (erroContagem) return { erro: erroContagem.message };

    if ((count ?? 0) > 0) {
      return {
        erro:
          "Esta etapa ainda tem cartões. Mova os cartões para outra coluna " +
          "antes de excluí-la.",
      };
    }

    const { error } = await supabase.from("kanban_etapas").delete().eq("id", id);
    if (error) return { erro: error.message };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao excluir a etapa." };
  }

  revalidatePath("/kanban");
  return { sucesso: "Etapa excluída." };
}

/** Troca a etapa de lugar com a vizinha. */
export async function moverEtapa(
  id: string,
  direcao: "esquerda" | "direita",
): Promise<EstadoKanban> {
  try {
    const { supabase } = await sessaoEditor();

    const { data: etapas, error: erroLista } = await supabase
      .from("kanban_etapas")
      .select("id")
      .order("ordem")
      .order("criado_em");
    if (erroLista) return { erro: erroLista.message };

    const ids = (etapas ?? []).map((e) => e.id as string);
    const atual = ids.indexOf(id);
    const destino = direcao === "esquerda" ? atual - 1 : atual + 1;
    if (atual < 0 || destino < 0 || destino >= ids.length) return {};

    [ids[atual], ids[destino]] = [ids[destino], ids[atual]];

    for (const [indice, etapaId] of ids.entries()) {
      const { error } = await supabase
        .from("kanban_etapas")
        .update({ ordem: indice })
        .eq("id", etapaId);
      if (error) return { erro: error.message };
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao reordenar." };
  }

  revalidatePath("/kanban");
  return {};
}
