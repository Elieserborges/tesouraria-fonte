"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const OPCOES = [
  { valor: "mes", rotulo: "Mês" },
  { valor: "ano", rotulo: "Ano" },
  { valor: "tudo", rotulo: "Tudo" },
] as const;

export type Periodo = (typeof OPCOES)[number]["valor"];

/** Alterna a janela do relatório mantendo os demais filtros da URL. */
export function SeletorPeriodo({ periodo }: { periodo: Periodo }) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();

  function escolher(valor: Periodo) {
    const proximos = new URLSearchParams(params.toString());
    proximos.set("periodo", valor);
    router.push(`${caminho}?${proximos.toString()}`);
  }

  return (
    <div
      role="group"
      aria-label="Período do relatório"
      className="flex rounded-xl border border-borda bg-superficie p-1"
    >
      {OPCOES.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => escolher(o.valor)}
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
  );
}
