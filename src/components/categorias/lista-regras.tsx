"use client";

import { useState, useTransition } from "react";
import { Trash2, Wand2 } from "lucide-react";
import { removerRegra } from "@/app/(app)/categorias/actions";
import { ROTULO_SEM_DESCRICAO, type RegraComUso } from "@/lib/types";

export function ListaRegras({
  regras,
  editavel,
}: {
  regras: RegraComUso[];
  editavel: boolean;
}) {
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function remover(regra: RegraComUso) {
    const rotulo = regra.padrao || ROTULO_SEM_DESCRICAO;
    const limpar = confirm(
      `Remover a regra de "${rotulo}"?\n\n` +
        `OK = remover a regra E tirar a categoria das ${regra.atingidas} transações que ela classificou.\n` +
        "Cancelar = manter as transações como estão (aparecerá outra pergunta).",
    );

    if (!limpar && !confirm("Remover a regra mantendo as transações categorizadas?")) {
      return;
    }

    setErro(null);
    setMensagem(null);
    iniciar(async () => {
      const r = await removerRegra(regra.id, limpar);
      if (r.erro) setErro(r.erro);
      else setMensagem(r.sucesso ?? null);
    });
  }

  return (
    <section className="cartao overflow-hidden">
      <header className="border-b border-borda px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-texto">
          <Wand2 size={15} aria-hidden />
          Regras automáticas
        </h2>
        <p className="mt-1 text-xs text-texto-suave">
          Criadas quando você categoriza uma transação. Valem para as iguais que
          ainda não têm categoria e para as que chegarem no futuro.
        </p>
      </header>

      {erro && (
        <p role="alert" className="mx-5 mt-3 rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">
          {erro}
        </p>
      )}
      {mensagem && (
        <p className="mx-5 mt-3 rounded-lg bg-verde-400/10 px-3 py-2 text-sm text-entrada">
          {mensagem}
        </p>
      )}

      {regras.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-texto-suave">
          Nenhuma regra ainda. Categorize uma transação e a regra aparece aqui.
        </p>
      ) : (
        <ul className={pendente ? "opacity-60" : undefined}>
          {regras.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 border-b border-borda/60 px-5 py-3 last:border-0"
            >
              <span
                aria-hidden
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  r.tipo === "entrada"
                    ? "bg-verde-400/15 text-entrada"
                    : "bg-alerta/12 text-saida"
                }`}
                title={r.tipo === "entrada" ? "Entradas" : "Saídas"}
              >
                {r.tipo === "entrada" ? "↓" : "↑"}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-texto">
                  {r.padrao || (
                    <em className="text-texto-suave">{ROTULO_SEM_DESCRICAO}</em>
                  )}
                </span>
                <span className="text-xs text-texto-suave">
                  {r.atingidas} transação{r.atingidas === 1 ? "" : "ões"}
                </span>
              </span>

              {r.categoria && (
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: `${r.categoria.cor}1f`,
                    color: r.categoria.cor,
                  }}
                >
                  {r.categoria.nome}
                </span>
              )}

              {editavel && (
                <button
                  type="button"
                  onClick={() => remover(r)}
                  aria-label={`Remover regra de ${r.padrao || ROTULO_SEM_DESCRICAO}`}
                  className="rounded-lg p-1.5 text-texto-suave transition hover:bg-alerta/10 hover:text-alerta"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
