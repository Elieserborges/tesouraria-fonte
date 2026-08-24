"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2, Sprout } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import { acertarRendimento, type ResultadoAcerto } from "@/app/(app)/cofrinho/actions";

/**
 * O único número do sistema que precisa ser digitado.
 *
 * Tudo o que entra e sai do cofrinho chega sozinho. O rendimento não: ele
 * nasce lá dentro e nunca passa pela conta corrente, então nenhuma API o
 * reporta e nenhum extrato o registra.
 *
 * Como as movimentações são conhecidas ao centavo, basta informar o saldo que
 * o aplicativo mostra: o que falta para chegar nele é o rendimento. Uma vez
 * por mês resolve.
 */
export function AcertarRendimento({ saldoAtual }: { saldoAtual: number }) {
  const [estado, enviar, enviando] = useActionState<ResultadoAcerto, FormData>(
    acertarRendimento,
    {},
  );
  const [valor, setValor] = useState("");

  return (
    <form action={enviar} className="cartao overflow-hidden">
      <header className="border-b border-borda px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-texto">
          <Sprout size={15} aria-hidden className="text-texto-suave" />
          Acertar o rendimento
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-texto-suave">
          O rendimento nasce dentro do cofrinho e não aparece em extrato nenhum.
          Informe o saldo que o aplicativo mostra na aba Cofrinhos e o sistema
          calcula quanto rendeu. Aqui está {formatarMoeda(saldoAtual)}.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 p-5">
        <label className="min-w-[9rem] flex-1">
          <span className="mb-1 block text-xs text-texto-suave">
            Saldo no aplicativo
          </span>
          <input
            name="saldo"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            required
            placeholder="4.115,48"
            className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-right font-semibold tabular-nums text-texto outline-none transition-colors focus:border-marca-400"
          />
        </label>
        <button
          type="submit"
          disabled={enviando || !valor.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-marca-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {enviando ? (
            <>
              <Loader2 size={15} aria-hidden className="animate-spin" /> Calculando…
            </>
          ) : (
            "Acertar"
          )}
        </button>
      </div>

      {estado.erro && (
        <p role="alert" className="mx-5 mb-5 rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">
          {estado.erro}
        </p>
      )}

      {estado.ajuste !== undefined && !estado.erro && (
        <div className="mx-5 mb-5 rounded-lg bg-verde-400/10 px-3 py-2.5 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-entrada">
            <CheckCircle2 size={15} aria-hidden />
            {estado.ajuste === 0
              ? "Já estava certo."
              : `Rendimento ajustado em ${formatarMoeda(Math.abs(estado.ajuste))}.`}
          </p>
          <p className="mt-1 text-xs text-texto-suave">
            Rendimento acumulado: {formatarMoeda(estado.rendimentoTotal ?? 0)} · saldo
            do cofrinho: {formatarMoeda(estado.saldo ?? 0)}
          </p>
        </div>
      )}
    </form>
  );
}
