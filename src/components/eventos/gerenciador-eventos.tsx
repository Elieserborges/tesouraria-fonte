"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlus, Pencil, Trash2, X } from "lucide-react";
import { salvarEvento, excluirEvento, type EstadoEvento } from "@/app/(app)/eventos/actions";
import { formatarData, formatarMoeda } from "@/lib/format";
import type { EventoComResultado } from "@/lib/types";

const CAMPO =
  "w-full rounded-xl border border-borda bg-superficie-2 px-3 py-2.5 text-sm text-texto outline-none transition focus:border-primaria focus:ring-2 focus:ring-primaria/25";

function BotaoSalvar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-primaria px-4 py-2.5 text-sm font-semibold text-primaria-contraste transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Salvar edição"}
    </button>
  );
}

function Formulario({
  categorias,
  edicao,
  aoFechar,
}: {
  categorias: string[];
  edicao?: EventoComResultado;
  aoFechar: () => void;
}) {
  const [estado, acao] = useActionState<EstadoEvento, FormData>(salvarEvento, {});
  const [ultimoSucesso, setUltimoSucesso] = useState<string | undefined>();

  if (estado.sucesso !== ultimoSucesso) {
    setUltimoSucesso(estado.sucesso);
    if (estado.sucesso) aoFechar();
  }

  return (
    <section className="cartao p-5">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-texto">
          {edicao ? "Editar edição" : "Nova edição"}
        </h2>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="rounded-lg p-1.5 text-texto-suave transition hover:bg-superficie-2"
        >
          <X size={16} />
        </button>
      </header>

      <form action={acao} className="grid gap-4 sm:grid-cols-2">
        {edicao && <input type="hidden" name="id" value={edicao.evento_id} />}

        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-texto">Nome da edição</span>
          <input
            name="nome"
            defaultValue={edicao?.nome}
            required
            placeholder="Face a Face Homens · Ago/2026"
            className={CAMPO}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-texto">Categoria</span>
          <select
            name="categoria_nome"
            defaultValue={edicao?.categoria_nome ?? ""}
            required
            className={CAMPO}
          >
            <option value="" disabled>
              Escolha…
            </option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-texto">Observação</span>
          <input
            name="observacao"
            defaultValue={edicao?.observacao ?? ""}
            placeholder="Ex.: 15 e 16 de agosto, sítio"
            className={CAMPO}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-texto">Janela — início</span>
          <input type="date" name="inicio" defaultValue={edicao?.inicio} required className={CAMPO} />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-texto">Janela — fim</span>
          <input type="date" name="fim" defaultValue={edicao?.fim} required className={CAMPO} />
        </label>

        <p className="text-xs text-texto-suave sm:col-span-2">
          A janela precisa cobrir desde a primeira inscrição até a última despesa —
          normalmente começa semanas antes do evento e termina depois. Toda
          transação da categoria dentro dela entra nesta edição.
        </p>

        {estado.erro && (
          <p role="alert" className="rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta sm:col-span-2">
            {estado.erro}
          </p>
        )}

        <div className="flex items-center gap-3 sm:col-span-2">
          <BotaoSalvar />
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-xl px-4 py-2.5 text-sm text-texto-suave transition hover:text-texto"
          >
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

export function GerenciadorEventos({
  eventos,
  categorias,
  editavel,
}: {
  eventos: EventoComResultado[];
  categorias: string[];
  editavel: boolean;
}) {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function remover(e: EventoComResultado) {
    if (
      !confirm(
        `Excluir a edição "${e.nome}"?\n\nAs ${e.lancamentos} transações continuam no ` +
          "sistema — elas só deixam de ser agrupadas por esta edição.",
      )
    )
      return;
    const r = await excluirEvento(e.evento_id);
    if (r.erro) setErro(r.erro);
    else setMensagem(r.sucesso ?? null);
  }

  // Agrupa as edições por categoria: é assim que se lê "quanto o Face a
  // Face rendeu no ano" sem somar na mão.
  const porCategoria = new Map<string, EventoComResultado[]>();
  for (const e of eventos) {
    porCategoria.set(e.categoria_nome, [...(porCategoria.get(e.categoria_nome) ?? []), e]);
  }

  const emEdicao = eventos.find((e) => e.evento_id === editando);

  return (
    <div className="space-y-6">
      {editavel && !criando && !emEdicao && (
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="flex items-center gap-2 rounded-xl bg-primaria px-4 py-2.5 text-sm font-semibold text-primaria-contraste transition hover:opacity-90"
        >
          <CalendarPlus size={16} aria-hidden />
          Nova edição
        </button>
      )}

      {criando && (
        <Formulario categorias={categorias} aoFechar={() => setCriando(false)} />
      )}
      {emEdicao && (
        <Formulario
          categorias={categorias}
          edicao={emEdicao}
          aoFechar={() => setEditando(null)}
        />
      )}

      {erro && (
        <p role="alert" className="rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">
          {erro}
        </p>
      )}
      {mensagem && (
        <p className="rounded-lg bg-verde-400/10 px-3 py-2 text-sm text-entrada">{mensagem}</p>
      )}

      {eventos.length === 0 ? (
        <section className="cartao p-8 text-center">
          <p className="text-sm text-texto-suave">
            Nenhuma edição cadastrada. Crie uma para separar, por exemplo, o Face
            a Face de agosto do de abril — mesmo estando na mesma categoria.
          </p>
        </section>
      ) : (
        [...porCategoria.entries()].map(([categoria, edicoes]) => {
          const totalEntradas = edicoes.reduce((s, e) => s + e.entradas, 0);
          const totalSaidas = edicoes.reduce((s, e) => s + e.saidas, 0);

          const total = totalEntradas - totalSaidas;

          return (
            <section key={categoria} className="cartao overflow-hidden">
              <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-borda px-5 py-4">
                <h2 className="text-sm font-semibold text-texto">{categoria}</h2>
                <p className="text-xs text-texto-suave">
                  {edicoes.length} {edicoes.length === 1 ? "edição" : "edições"} ·
                  resultado somado{" "}
                  <strong
                    className={`valor-sensivel tabular-nums ${
                      total >= 0 ? "text-entrada" : "text-saida"
                    }`}
                  >
                    {formatarMoeda(total)}
                  </strong>
                </p>
              </header>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="border-b border-borda text-left text-xs uppercase tracking-wider text-texto-suave">
                      <th className="px-5 py-3 font-medium">Edição</th>
                      <th className="px-5 py-3 font-medium">Janela</th>
                      <th className="px-5 py-3 text-right font-medium">Lanç.</th>
                      <th className="px-5 py-3 text-right font-medium">Entradas</th>
                      <th className="px-5 py-3 text-right font-medium">Saídas</th>
                      <th className="px-5 py-3 text-right font-medium">Resultado</th>
                      {editavel && <th className="w-20 px-5 py-3" />}
                    </tr>
                  </thead>
                  <tbody>
                    {edicoes.map((e) => (
                      <tr
                        key={e.evento_id}
                        className="border-b border-borda/60 last:border-0 hover:bg-superficie-2/60"
                      >
                        <td className="w-full max-w-0 px-5 py-3">
                          <span className="block truncate font-medium text-texto">
                            {e.nome}
                          </span>
                          {e.observacao && (
                            <span className="block truncate text-xs text-texto-suave">
                              {e.observacao}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-xs text-texto-suave tabular-nums">
                          {formatarData(new Date(`${e.inicio}T12:00:00`))} a{" "}
                          {formatarData(new Date(`${e.fim}T12:00:00`))}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-texto-suave">
                          {e.lancamentos}
                        </td>
                        <td className="valor-sensivel whitespace-nowrap px-5 py-3 text-right tabular-nums text-entrada">
                          {e.entradas ? formatarMoeda(e.entradas) : "—"}
                        </td>
                        <td className="valor-sensivel whitespace-nowrap px-5 py-3 text-right tabular-nums text-saida">
                          {e.saidas ? formatarMoeda(e.saidas) : "—"}
                        </td>
                        <td
                          className={`valor-sensivel whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums ${
                            e.resultado >= 0 ? "text-entrada" : "text-saida"
                          }`}
                        >
                          {formatarMoeda(e.resultado)}
                        </td>
                        {editavel && (
                          <td className="px-5 py-3">
                            <span className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setCriando(false);
                                  setEditando(e.evento_id);
                                }}
                                aria-label={`Editar ${e.nome}`}
                                className="rounded-lg p-1.5 text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => remover(e)}
                                aria-label={`Excluir ${e.nome}`}
                                className="rounded-lg p-1.5 text-texto-suave transition hover:bg-alerta/10 hover:text-alerta"
                              >
                                <Trash2 size={15} />
                              </button>
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
