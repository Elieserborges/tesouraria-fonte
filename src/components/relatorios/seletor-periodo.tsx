"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";

const OPCOES = [
  { valor: "mes", rotulo: "Mês" },
  { valor: "ano", rotulo: "Ano" },
  { valor: "tudo", rotulo: "Tudo" },
  { valor: "personalizado", rotulo: "Personalizado" },
] as const;

export type Periodo = (typeof OPCOES)[number]["valor"];

/** Teto do período personalizado. Acima disso, use Ano ou Tudo. */
export const MAX_DIAS_PERSONALIZADO = 92;

const CAMPO =
  "rounded-xl border border-borda bg-superficie px-3 py-2 text-sm text-texto outline-none focus:border-primaria focus:ring-2 focus:ring-primaria/25";

export function SeletorPeriodo({
  periodo,
  de,
  ate,
}: {
  periodo: Periodo;
  de?: string;
  ate?: string;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();

  const [inicio, setInicio] = useState(de ?? "");
  const [fim, setFim] = useState(ate ?? "");
  const [erro, setErro] = useState<string | null>(null);

  function irPara(ajustes: Record<string, string | null>) {
    const proximos = new URLSearchParams(params.toString());
    for (const [chave, valor] of Object.entries(ajustes)) {
      if (valor === null) proximos.delete(chave);
      else proximos.set(chave, valor);
    }
    router.push(`${caminho}?${proximos.toString()}`);
  }

  function aplicarPersonalizado() {
    setErro(null);

    if (!inicio || !fim) {
      setErro("Preencha as duas datas.");
      return;
    }
    const d1 = new Date(`${inicio}T00:00:00`);
    const d2 = new Date(`${fim}T00:00:00`);

    if (d2 < d1) {
      setErro("A data final não pode ser anterior à inicial.");
      return;
    }

    const dias = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
    if (dias > MAX_DIAS_PERSONALIZADO) {
      setErro(
        `O período personalizado vai até 3 meses (${dias} dias selecionados). ` +
          "Para intervalos maiores, use Ano ou Tudo.",
      );
      return;
    }

    irPara({ periodo: "personalizado", de: inicio, ate: fim });
  }

  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label="Período do relatório"
        className="flex flex-wrap rounded-xl border border-borda bg-superficie p-1"
      >
        {OPCOES.map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() =>
              o.valor === "personalizado"
                ? setErro(null)
                : irPara({ periodo: o.valor, de: null, ate: null })
            }
            aria-pressed={periodo === o.valor}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              periodo === o.valor
                ? "bg-primaria text-primaria-contraste"
                : "text-texto-suave hover:text-texto"
            }`}
          >
            {o.rotulo}
          </button>
        ))}
      </div>

      {periodo === "personalizado" && (
        <div className="cartao space-y-2 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="block text-xs text-texto-suave">De</span>
              <input
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className={CAMPO}
              />
            </label>
            <label className="space-y-1">
              <span className="block text-xs text-texto-suave">Até</span>
              <input
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className={CAMPO}
              />
            </label>
            <button
              type="button"
              onClick={aplicarPersonalizado}
              className="flex items-center gap-1.5 rounded-xl bg-primaria px-3.5 py-2 text-sm font-semibold text-primaria-contraste transition hover:opacity-90"
            >
              <CalendarRange size={15} aria-hidden />
              Aplicar
            </button>
          </div>

          {erro ? (
            <p role="alert" className="text-xs text-alerta">
              {erro}
            </p>
          ) : (
            <p className="text-xs text-texto-suave">Máximo de 3 meses por consulta.</p>
          )}
        </div>
      )}
    </div>
  );
}
