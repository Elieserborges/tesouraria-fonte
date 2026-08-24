import type { Metadata } from "next";
import { GerenciadorMetas } from "@/components/metas/gerenciador-metas";
import { listarCategorias, listarMetas } from "@/lib/dados";
import { obterSessao } from "@/lib/supabase/server";
import { podeEditar } from "@/lib/types";

export const metadata: Metadata = { title: "Metas · Fluxx Finance" };

export default async function PaginaMetas() {
  const sessao = await obterSessao();
  const editavel = podeEditar(sessao?.perfil?.papel);

  const [metas, categorias] = await Promise.all([listarMetas(), listarCategorias()]);

  // Transferência entre contas não é receita nem despesa, então planejar
  // sobre ela não diria nada.
  const nomes = [
    ...new Set(categorias.filter((c) => !c.eh_transferencia).map((c) => c.nome)),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-texto">Metas</h1>
        <p className="max-w-2xl text-sm text-texto-suave">
          Quanto cada setor espera arrecadar ou gastar num período. O realizado
          vem sozinho dos lançamentos já categorizados — não há nada a marcar.
        </p>
      </header>

      <GerenciadorMetas metas={metas} categorias={nomes} editavel={editavel} />
    </div>
  );
}
