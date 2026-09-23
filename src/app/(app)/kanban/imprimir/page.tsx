import type { Metadata } from "next";
import Link from "next/link";
import { BotaoImprimir } from "@/components/exportar/botao-imprimir";
import { FolhaMural } from "@/components/kanban/folha-mural";
import { FolhaRelatorio } from "@/components/kanban/folha-relatorio";
import { listarKanban } from "@/lib/dados";
import { obterSessao } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Quadro Kanban · Fluxx Finance" };

/*
 * Dois papéis para o mesmo quadro.
 *
 * O mural é para a parede: colunas lado a lado, folha deitada, leitura de
 * longe. O relatório é para a mão: seções empilhadas em tabela, com resumo
 * por etapa na frente, do jeito que se lê sentado numa reunião.
 *
 * Um não substitui o outro — e ficam na mesma rota porque são a mesma
 * informação, só que endereçada a duas situações diferentes.
 */
const MODELOS = [
  { chave: "mural", rotulo: "Mural" },
  { chave: "relatorio", rotulo: "Relatório" },
] as const;

export default async function KanbanImpresso(
  props: PageProps<"/kanban/imprimir">,
) {
  const sp = await props.searchParams;
  const pedido = typeof sp.modelo === "string" ? sp.modelo : undefined;
  const modelo = pedido === "relatorio" ? "relatorio" : "mural";

  const sessao = await obterSessao();
  const { etapas, cartoes } = await listarKanban();
  const autor = sessao?.perfil?.nome ?? null;

  return (
    <>
      <div className="nao-imprimir mx-auto mb-4 max-w-[297mm] space-y-3">
        <BotaoImprimir />

        <div className="flex items-center gap-2 text-sm">
          <span className="text-texto-suave">Modelo:</span>
          {MODELOS.map(({ chave, rotulo }) => (
            <Link
              key={chave}
              href={chave === "mural" ? "/kanban/imprimir" : `/kanban/imprimir?modelo=${chave}`}
              prefetch={false}
              aria-current={modelo === chave ? "page" : undefined}
              className={`rounded-lg border px-3 py-1.5 font-medium transition ${
                modelo === chave
                  ? "border-primaria bg-primaria text-primaria-contraste"
                  : "border-borda text-texto hover:bg-superficie-2"
              }`}
            >
              {rotulo}
            </Link>
          ))}
        </div>
      </div>

      {modelo === "relatorio" ? (
        <FolhaRelatorio etapas={etapas} cartoes={cartoes} autor={autor} />
      ) : (
        <FolhaMural etapas={etapas} cartoes={cartoes} autor={autor} />
      )}
    </>
  );
}
