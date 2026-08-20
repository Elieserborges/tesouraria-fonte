"use client";

import { useMemo, useRef, useState } from "react";
import { Equal, Plus, Minus, RotateCcw, X } from "lucide-react";
import { formatarMoeda } from "@/lib/format";

type Lancamento = { id: number; valor: number; nota: string };

/**
 * Calculadora de fita, como a das máquinas de somar.
 *
 * A conta que a tesouraria mais faz é somar uma pilha de valores — o dinheiro
 * do culto, as notas de um evento — e conferir. Numa calculadora comum, se
 * você errar o décimo valor, refaz tudo. Aqui cada lançamento fica na tela:
 * dá para revisar, apagar um e ver o total se ajustar.
 *
 * A nota ao lado do valor é opcional e existe para o momento de conferir:
 * "de onde veio esse 250?" tem resposta sem depender da memória.
 */
export function Fita() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const [sinal, setSinal] = useState<1 | -1>(1);
  const proximoId = useRef(1);
  const campoValor = useRef<HTMLInputElement>(null);

  const total = useMemo(
    () => lancamentos.reduce((soma, l) => soma + l.valor, 0),
    [lancamentos],
  );

  /*
   * Aceita tanto "1.234,56" quanto "1234.56".
   *
   * Quem digita rápido no teclado numérico usa o ponto; quem copia de um
   * relatório traz a vírgula. Recusar qualquer um dos dois só faria a pessoa
   * digitar de novo.
   */
  function interpretar(texto: string): number | null {
    const limpo = texto.trim().replace(/\s/g, "").replace(/^R\$/i, "");
    if (!limpo) return null;
    const normalizado = limpo.includes(",")
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo;
    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : null;
  }

  function adicionar() {
    const numero = interpretar(valor);
    if (numero === null || numero === 0) return;

    setLancamentos((atuais) => [
      ...atuais,
      { id: proximoId.current++, valor: Math.abs(numero) * sinal, nota: nota.trim() },
    ]);
    setValor("");
    setNota("");
    campoValor.current?.focus();
  }

  function remover(id: number) {
    setLancamentos((atuais) => atuais.filter((l) => l.id !== id));
  }

  const entradas = lancamentos.filter((l) => l.valor > 0);
  const saidas = lancamentos.filter((l) => l.valor < 0);

  return (
    <div className="cartao overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-borda px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-texto">Fita de soma</h2>
          <p className="mt-0.5 text-xs text-texto-suave">
            Um valor por vez. Errou um? Apaga só ele.
          </p>
        </div>
        {lancamentos.length > 0 && (
          <button
            type="button"
            onClick={() => setLancamentos([])}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
          >
            <RotateCcw size={13} aria-hidden /> Limpar
          </button>
        )}
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          adicionar();
        }}
        className="flex flex-wrap items-end gap-2 border-b border-borda px-5 py-4"
      >
        {/* O sinal fica em botão, não em menu: é a escolha mais repetida. */}
        <div className="flex overflow-hidden rounded-lg border border-borda">
          <button
            type="button"
            onClick={() => setSinal(1)}
            aria-pressed={sinal === 1}
            className={`px-2.5 py-2 transition-colors ${
              sinal === 1 ? "bg-verde-400/15 text-entrada" : "text-texto-suave hover:bg-superficie-2"
            }`}
            title="Somar"
          >
            <Plus size={15} aria-hidden />
            <span className="sr-only">Somar</span>
          </button>
          <button
            type="button"
            onClick={() => setSinal(-1)}
            aria-pressed={sinal === -1}
            className={`border-l border-borda px-2.5 py-2 transition-colors ${
              sinal === -1 ? "bg-alerta/12 text-saida" : "text-texto-suave hover:bg-superficie-2"
            }`}
            title="Subtrair"
          >
            <Minus size={15} aria-hidden />
            <span className="sr-only">Subtrair</span>
          </button>
        </div>

        <label className="min-w-[8rem] flex-1">
          <span className="sr-only">Valor</span>
          <input
            ref={campoValor}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            autoFocus
            placeholder="0,00"
            className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-right font-semibold tabular-nums text-texto outline-none transition-colors focus:border-marca-400"
          />
        </label>

        <label className="min-w-[10rem] flex-[2]">
          <span className="sr-only">De onde veio</span>
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="de onde veio (opcional)"
            className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm text-texto outline-none transition-colors focus:border-marca-400"
          />
        </label>

        <button
          type="submit"
          className="rounded-lg bg-marca-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Somar
        </button>
      </form>

      {lancamentos.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-texto-suave">
          Digite o primeiro valor e aperte Enter.
        </p>
      ) : (
        <ol className="divide-y divide-borda/60">
          {lancamentos.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-texto-suave">
                {l.nota || <span className="opacity-50">—</span>}
              </span>
              <span
                className={`shrink-0 font-semibold tabular-nums ${
                  l.valor > 0 ? "text-entrada" : "text-saida"
                }`}
              >
                {l.valor > 0 ? "+" : "−"} {formatarMoeda(Math.abs(l.valor))}
              </span>
              <button
                type="button"
                onClick={() => remover(l.id)}
                aria-label={`Remover ${formatarMoeda(Math.abs(l.valor))}`}
                className="shrink-0 rounded p-1 text-texto-suave transition-colors hover:bg-superficie-2 hover:text-saida"
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}

      <footer className="border-t-2 border-texto/15 bg-superficie-2/50 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto">
            <Equal size={14} aria-hidden /> Total
          </span>
          <span
            className={`text-2xl font-bold tabular-nums ${
              total >= 0 ? "text-texto" : "text-saida"
            }`}
          >
            {formatarMoeda(total)}
          </span>
        </div>

        {saidas.length > 0 && entradas.length > 0 && (
          <p className="mt-1.5 text-right text-xs text-texto-suave tabular-nums">
            {formatarMoeda(entradas.reduce((s, l) => s + l.valor, 0))} somados,{" "}
            {formatarMoeda(Math.abs(saidas.reduce((s, l) => s + l.valor, 0)))} subtraídos
          </p>
        )}
        {lancamentos.length > 0 && (
          <p className="mt-1 text-right text-xs text-texto-suave">
            {lancamentos.length} {lancamentos.length === 1 ? "lançamento" : "lançamentos"}
          </p>
        )}
      </footer>
    </div>
  );
}
