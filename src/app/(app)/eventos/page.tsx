import type { Metadata } from "next";
import { GerenciadorEventos } from "@/components/eventos/gerenciador-eventos";
import { listarCategorias, listarEventos } from "@/lib/dados";
import { obterSessao } from "@/lib/supabase/server";
import { podeEditar } from "@/lib/types";

export const metadata: Metadata = { title: "Eventos · Fluxx Finance" };

export default async function PaginaEventos() {
  const sessao = await obterSessao();
  const editavel = podeEditar(sessao?.perfil?.papel);

  const [eventos, categorias] = await Promise.all([listarEventos(), listarCategorias()]);

  // Uma edição precisa de entrada e saída com o mesmo nome; o seletor
  // oferece os nomes distintos, sem repetir por tipo.
  const nomes = [...new Set(categorias.filter((c) => !c.eh_transferencia).map((c) => c.nome))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-texto">Eventos</h1>
        <p className="max-w-3xl text-sm text-texto-suave">
          Cada edição tem uma janela de datas. Toda transação da categoria dentro
          dessa janela entra na edição — sem precisar marcar lançamento por
          lançamento. É o que separa o Face a Face de agosto do de abril sem criar
          uma categoria nova a cada vez.
        </p>
      </header>

      <GerenciadorEventos eventos={eventos} categorias={nomes} editavel={editavel} />
    </div>
  );
}
