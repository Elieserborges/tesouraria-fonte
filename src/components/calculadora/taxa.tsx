"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { formatarMoeda } from "@/lib/format";

export type OpcaoDeTaxa = {
  chave: string;
  rotulo: string;
  taxa: number;
  recebimentos: number;
  bruto: number;
};

/**
 * Quanto sobra depois da tarifa, e quanto cobrar para sobrar o que se quer.
 *
 * Toda vez que a igreja define o preço de um ingresso aparece a mesma dúvida:
 * cobrando R$ 30, quanto entra na conta? E se a meta é receber R$ 30 limpos,
 * quanto precisa cobrar? A segunda é a que erra mais, porque não basta somar
 * a taxa — é preciso dividir por (1 − taxa).
 *
 * As taxas não são decoradas: vêm do que esta conta pagou de verdade em cada
 * caminho. E o caminho importa mais que a forma — o mesmo Pix não cobra nada
 * na chave e cobra cerca de 1% pelo link de pagamento. Uma média entre os dois
 * levaria a decisão errada.
 */
export function Taxa({ opcoes }: { opcoes: OpcaoDeTaxa[] }) {
  const [escolhida, setEscolhida] = useState(opcoes[0]?.chave ?? "");
  const [texto, setTexto] = useState("");
  const [personalizada, setPersonalizada] = useState<string | null>(null);

  const opcao = opcoes.find((o) => o.chave === escolhida);

  function numero(valor: string): number {
    const limpo = valor.trim().replace(/\s/g, "").replace(/^R\$/i, "");
    if (!limpo) return 0;
    const normalizado = limpo.includes(",")
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo;
    const n = Number(normalizado);
    return Number.isFinite(n) ? n : 0;
  }

  const valor = numero(texto);
  const percentual =
    (personalizada !== null ? numero(personalizada) : (opcao?.taxa ?? 0)) / 100;

  const tarifa = valor * percentual;
  const liquido = valor - tarifa;
  const paraReceber = percentual < 1 ? valor / (1 - percentual) : 0;

  return (
    <div className="cartao overflow-hidden">
      <header className="border-b border-borda px-5 py-4">
        <h2 className="text-sm font-semibold text-texto">Tarifa do Mercado Pago</h2>
        <p className="mt-0.5 text-xs text-texto-suave">
          Quanto sobra do que você cobra — e quanto cobrar para sobrar o que precisa.
        </p>
      </header>

      {/* Uma forma por botão: a taxa muda muito entre elas. */}
      <div className="flex flex-wrap gap-1.5 border-b border-borda px-5 py-3">
        {opcoes.map((o) => (
          <button
            key={o.chave}
            type="button"
            onClick={() => {
              setEscolhida(o.chave);
              setPersonalizada(null);
            }}
            aria-pressed={personalizada === null && escolhida === o.chave}
            title={`Média de ${o.recebimentos} recebimentos`}
            className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
              personalizada === null && escolhida === o.chave
                ? "bg-marca-500 text-white"
                : "bg-superficie-2 text-texto-suave hover:text-texto"
            }`}
          >
            {o.rotulo}{" "}
            <span className="tabular-nums opacity-75">
              {String(o.taxa).replace(".", ",")}%
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-borda px-5 py-4">
        <label className="min-w-[8rem] flex-1">
          <span className="mb-1 block text-xs text-texto-suave">Valor</span>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-right font-semibold tabular-nums text-texto outline-none transition-colors focus:border-marca-400"
          />
        </label>
        <label className="w-28">
          <span className="mb-1 block text-xs text-texto-suave">Taxa %</span>
          <input
            value={
              personalizada !== null
                ? personalizada
                : String(opcao?.taxa ?? 0).replace(".", ",")
            }
            onChange={(e) => setPersonalizada(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-right tabular-nums text-texto outline-none transition-colors focus:border-marca-400"
          />
        </label>
      </div>

      {valor > 0 ? (
        <dl className="divide-y divide-borda/60">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <dt className="text-sm text-texto-suave">
              Cobrando {formatarMoeda(valor)}, entra na conta
            </dt>
            <dd className="shrink-0 font-semibold tabular-nums text-entrada">
              {formatarMoeda(liquido)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <dt className="text-sm text-texto-suave">O Mercado Pago fica com</dt>
            <dd className="shrink-0 font-semibold tabular-nums text-saida">
              {formatarMoeda(tarifa)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 bg-superficie-2/50 px-5 py-3">
            <dt className="inline-flex items-center gap-1.5 text-sm text-texto">
              Para receber {formatarMoeda(valor)} limpos, cobre
              <ArrowRight size={13} aria-hidden className="text-texto-suave" />
            </dt>
            <dd className="shrink-0 text-lg font-bold tabular-nums text-texto">
              {formatarMoeda(paraReceber)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-texto-suave">
          Digite um valor para ver as duas contas.
        </p>
      )}
    </div>
  );
}
