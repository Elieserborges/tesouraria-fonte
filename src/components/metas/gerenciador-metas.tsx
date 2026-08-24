"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import type { MetaComResultado } from "@/lib/types";
import { excluirMeta, salvarMeta, type EstadoMeta } from "@/app/(app)/metas/actions";

const CAMPO =
  "w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm text-texto outline-none transition focus:border-marca-400";

/**
 * O previsto ao lado do realizado, categoria por categoria.
 *
 * A leitura que interessa não é "quanto entrou", que os relatórios já dão, e
 * sim se está no caminho. Por isso cada meta mostra a barra e o que falta —
 * ou o que passou, que numa despesa é aviso e numa receita é comemoração.
 */
export function GerenciadorMetas({
  metas,
  categorias,
  editavel,
}: {
  metas: MetaComResultado[];
  categorias: string[];
  editavel: boolean;
}) {
  const [estado, enviar, enviando] = useActionState<EstadoMeta, FormData>(salvarMeta, {});
  const [emEdicao, setEmEdicao] = useState<MetaComResultado | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  const formAberto = abrindo || emEdicao !== null;

  function fechar() {
    setAbrindo(false);
    setEmEdicao(null);
  }

  async function remover(meta: MetaComResultado) {
    if (!confirm(`Excluir a meta de ${meta.categoria_nome}? Nenhum lançamento é afetado.`))
      return;
    await excluirMeta(meta.meta_id);
  }

  return (
    <div className="space-y-4">
      {estado.erro && (
        <p role="alert" className="rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">
          {estado.erro}
        </p>
      )}

      {editavel && !formAberto && (
        <button
          type="button"
          onClick={() => setAbrindo(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-marca-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={15} aria-hidden /> Nova meta
        </button>
      )}

      {formAberto && (
        <form
          action={(dados) => {
            enviar(dados);
            fechar();
          }}
          className="cartao space-y-4 p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-texto">
              {emEdicao ? "Editar meta" : "Nova meta"}
            </h2>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar"
              className="rounded-lg p-1 text-texto-suave transition hover:bg-superficie-2"
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          {emEdicao && <input type="hidden" name="id" value={emEdicao.meta_id} />}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-texto-suave">Categoria</span>
              <select
                name="categoria_nome"
                defaultValue={emEdicao?.categoria_nome ?? ""}
                required
                className={CAMPO}
              >
                <option value="">Escolha…</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs text-texto-suave">O que se planeja</span>
              <select name="tipo" defaultValue={emEdicao?.tipo ?? "entrada"} className={CAMPO}>
                <option value="entrada">Arrecadar</option>
                <option value="saida">Gastar</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs text-texto-suave">De</span>
              <input
                type="date"
                name="inicio"
                defaultValue={emEdicao?.inicio ?? ""}
                required
                className={CAMPO}
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs text-texto-suave">Até</span>
              <input
                type="date"
                name="fim"
                defaultValue={emEdicao?.fim ?? ""}
                required
                className={CAMPO}
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs text-texto-suave">Quanto</span>
              <input
                name="valor"
                inputMode="decimal"
                defaultValue={emEdicao ? String(emEdicao.previsto).replace(".", ",") : ""}
                placeholder="5.000,00"
                required
                className={`${CAMPO} text-right font-semibold tabular-nums`}
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs text-texto-suave">Observação</span>
              <input
                name="observacao"
                defaultValue={emEdicao?.observacao ?? ""}
                placeholder="opcional"
                className={CAMPO}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={enviando}
            className="rounded-lg bg-marca-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {enviando ? "Salvando…" : "Salvar meta"}
          </button>
        </form>
      )}

      {metas.length === 0 ? (
        <p className="cartao px-5 py-12 text-center text-sm text-texto-suave">
          Nenhuma meta ainda. Comece pelo setor que mais precisa de previsão.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {metas.map((m) => {
            const entrada = m.tipo === "entrada";
            const parte = m.previsto > 0 ? m.realizado / m.previsto : 0;
            const percentual = Math.round(parte * 100);
            const diferenca = m.realizado - m.previsto;

            /*
             * Passar do previsto é bom numa receita e ruim numa despesa —
             * a mesma barra cheia significa coisas opostas. A cor segue o
             * que a situação quer dizer, não o número.
             */
            const bom = entrada ? parte >= 1 : m.realizado <= m.previsto;
            const cor = bom ? "bg-entrada" : parte >= 1 ? "bg-alerta" : "bg-marca-400";

            return (
              <li key={m.meta_id} className="cartao p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-texto">{m.categoria_nome}</p>
                    <p className="text-xs text-texto-suave">
                      {entrada ? "Arrecadar" : "Gastar"} ·{" "}
                      {m.inicio.split("-").reverse().join("/")} a{" "}
                      {m.fim.split("-").reverse().join("/")}
                    </p>
                  </div>
                  {editavel && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setEmEdicao(m)}
                        aria-label={`Editar meta de ${m.categoria_nome}`}
                        className="rounded-lg p-1.5 text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remover(m)}
                        aria-label={`Excluir meta de ${m.categoria_nome}`}
                        className="rounded-lg p-1.5 text-texto-suave transition hover:bg-alerta/10 hover:text-alerta"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-end justify-between gap-3">
                  <span className="valor-sensivel text-xl font-semibold tabular-nums text-texto">
                    {formatarMoeda(m.realizado)}
                  </span>
                  <span className="text-xs text-texto-suave tabular-nums">
                    de {formatarMoeda(m.previsto)}
                  </span>
                </div>

                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-superficie-2"
                  role="img"
                  aria-label={`${percentual}% do previsto`}
                >
                  <div
                    className={`h-full rounded-full transition-all ${cor}`}
                    style={{ width: `${Math.min(parte, 1) * 100}%` }}
                  />
                </div>

                <p className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="tabular-nums text-texto-suave">{percentual}%</span>
                  <span className={bom ? "text-entrada" : "text-texto-suave"}>
                    {diferenca >= 0
                      ? entrada
                        ? `${formatarMoeda(diferenca)} acima do previsto`
                        : `${formatarMoeda(diferenca)} acima do orçado`
                      : `faltam ${formatarMoeda(-diferenca)}`}
                  </span>
                </p>

                {m.observacao && (
                  <p className="mt-2 text-xs text-texto-suave">{m.observacao}</p>
                )}
                <p className="mt-1 text-[0.7rem] text-texto-suave">
                  {m.lancamentos}{" "}
                  {m.lancamentos === 1 ? "lançamento" : "lançamentos"} no período
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
