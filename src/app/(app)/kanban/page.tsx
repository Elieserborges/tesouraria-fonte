import type { Metadata } from "next";
import { QuadroKanban } from "@/components/kanban/quadro-kanban";
import { listarCategorias, listarKanban } from "@/lib/dados";
import { obterSessao } from "@/lib/supabase/server";
import { podeEditar } from "@/lib/types";

export const metadata: Metadata = { title: "Kanban · Fluxx Finance" };

export default async function PaginaKanban() {
  const sessao = await obterSessao();
  const editavel = podeEditar(sessao?.perfil?.papel);

  const [{ etapas, cartoes }, categorias] = await Promise.all([
    listarKanban(),
    listarCategorias(),
  ]);

  // Entrada e saída do mesmo assunto são duas categorias com o mesmo nome; no
  // cartão a distinção não diz nada, então a lista vai sem repetição.
  const nomes = [...new Set(categorias.map((c) => c.nome))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-texto">Kanban</h1>
        <p className="max-w-2xl text-sm text-texto-suave">
          O que está em andamento antes de virar lançamento: orçamento pedido,
          cotação, compra aprovada, conta paga. As etapas são suas — renomeie,
          reordene e crie quantas o quadro precisar.
        </p>
      </header>

      <QuadroKanban
        etapas={etapas}
        cartoes={cartoes}
        categorias={nomes}
        editavel={editavel}
      />
    </div>
  );
}
