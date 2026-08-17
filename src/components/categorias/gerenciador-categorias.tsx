"use client";

import { useActionState, useEffect, useRef, useTransition, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import {
  criarCategoria,
  excluirCategoria,
  type EstadoCategoria,
} from "@/app/(app)/categorias/actions";
import { formatarMoeda } from "@/lib/format";
import type { Categoria, TipoTransacao } from "@/lib/types";

export type CategoriaComUso = Categoria & { usos: number; total: number };

function BotaoAdicionar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 rounded-xl bg-primaria px-4 py-2.5 text-sm font-semibold text-primaria-contraste transition hover:opacity-90 disabled:opacity-60"
    >
      <Plus size={16} aria-hidden />
      {pending ? "Criando…" : "Adicionar"}
    </button>
  );
}

export function GerenciadorCategorias({
  categorias,
  editavel,
}: {
  categorias: CategoriaComUso[];
  editavel: boolean;
}) {
  const [estado, acao] = useActionState<EstadoCategoria, FormData>(
    criarCategoria,
    {},
  );
  const [tipo, setTipo] = useState<TipoTransacao>("saida");
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.sucesso) formRef.current?.reset();
  }, [estado.sucesso]);

  function remover(categoria: CategoriaComUso) {
    const aviso = categoria.usos
      ? `${categoria.usos} transação(ões) usam "${categoria.nome}" e ficarão sem categoria. Continuar?`
      : `Excluir a categoria "${categoria.nome}"?`;
    if (!confirm(aviso)) return;

    setErroExclusao(null);
    iniciarTransicao(async () => {
      const r = await excluirCategoria(categoria.id);
      if (r.erro) setErroExclusao(r.erro);
    });
  }

  const grupos: { titulo: string; tipo: TipoTransacao }[] = [
    { titulo: "Entradas", tipo: "entrada" },
    { titulo: "Saídas", tipo: "saida" },
  ];

  return (
    <div className="space-y-6">
      {editavel && (
        <section className="cartao p-5">
          <h2 className="mb-4 text-sm font-semibold text-texto">Nova categoria</h2>
          <form
            ref={formRef}
            action={acao}
            className="flex flex-wrap items-end gap-3"
          >
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-texto">Nome</span>
              <input
                name="nome"
                required
                placeholder="Ex.: Reforma do templo"
                className="w-56 rounded-xl border border-borda bg-superficie-2 px-3 py-2.5 text-sm text-texto outline-none focus:border-primaria focus:ring-2 focus:ring-primaria/25"
              />
            </label>

            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-texto">Tipo</span>
              <select
                name="tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoTransacao)}
                className="rounded-xl border border-borda bg-superficie-2 px-3 py-2.5 text-sm text-texto outline-none focus:border-primaria focus:ring-2 focus:ring-primaria/25"
              >
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-texto">Cor</span>
              <input
                name="cor"
                type="color"
                defaultValue="#20A979"
                className="h-11 w-16 cursor-pointer rounded-xl border border-borda bg-superficie-2 p-1"
              />
            </label>

            <BotaoAdicionar />

            {estado.erro && (
              <p role="alert" className="w-full rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">
                {estado.erro}
              </p>
            )}
          </form>
        </section>
      )}

      {erroExclusao && (
        <p role="alert" className="rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">
          {erroExclusao}
        </p>
      )}

      <div className={`grid gap-4 lg:grid-cols-2 ${pendente ? "opacity-60" : ""}`}>
        {grupos.map(({ titulo, tipo: t }) => {
          const doGrupo = categorias.filter((c) => c.tipo === t);
          return (
            <section key={t} className="cartao overflow-hidden">
              <h2 className="border-b border-borda px-5 py-4 text-sm font-semibold text-texto">
                {titulo}
              </h2>
              <ul>
                {doGrupo.length === 0 && (
                  <li className="px-5 py-6 text-sm text-texto-suave">
                    Nenhuma categoria cadastrada.
                  </li>
                )}
                {doGrupo.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 border-b border-borda/60 px-5 py-3 last:border-0"
                  >
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: c.cor }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-texto">
                      {c.nome}
                    </span>
                    <span className="whitespace-nowrap text-xs text-texto-suave">
                      {c.usos} lanç. · {formatarMoeda(c.total)}
                    </span>
                    {editavel && (
                      <button
                        type="button"
                        onClick={() => remover(c)}
                        aria-label={`Excluir categoria ${c.nome}`}
                        className="rounded-lg p-1.5 text-texto-suave transition hover:bg-alerta/10 hover:text-alerta"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
