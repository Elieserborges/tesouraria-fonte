import type { ReactNode } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatarMoeda, formatarVariacao } from "@/lib/format";

type Props = {
  titulo: string;
  valor: number;
  anterior?: number;
  /** "positivo" = subir é bom (entradas). "negativo" = subir é ruim (saídas). */
  sentido?: "positivo" | "negativo" | "neutro";
  icone?: ReactNode;
  destaque?: boolean;
  rodape?: ReactNode;
};

export function CartaoMetrica({
  titulo,
  valor,
  anterior,
  sentido = "neutro",
  icone,
  destaque = false,
  rodape,
}: Props) {
  const variacao =
    anterior === undefined ? null : formatarVariacao(valor, anterior);

  // Cor da variação: leva em conta se subir é bom ou ruim para esta métrica.
  let corVariacao = "text-texto-suave";
  if (variacao && variacao.sinal !== "neutro") {
    const bom =
      sentido === "negativo"
        ? variacao.sinal === "negativo"
        : variacao.sinal === "positivo";
    corVariacao = bom ? "text-entrada" : "text-saida";
  }

  const IconeVariacao =
    variacao?.sinal === "positivo"
      ? TrendingUp
      : variacao?.sinal === "negativo"
        ? TrendingDown
        : Minus;

  return (
    <article
      className={`cartao flex flex-col gap-3 p-5 ${
        destaque
          ? "bg-gradient-to-br from-marca-900 to-marca-700 text-white border-transparent"
          : ""
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <h3
          className={`text-sm font-medium ${destaque ? "text-white/70" : "text-texto-suave"}`}
        >
          {titulo}
        </h3>
        {icone && (
          <span className={destaque ? "text-white/60" : "text-texto-suave"}>
            {icone}
          </span>
        )}
      </header>

      <p
        className={`text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${
          destaque ? "text-white" : "text-texto"
        }`}
      >
        {formatarMoeda(valor)}
      </p>

      {variacao && (
        <p
          className={`flex items-center gap-1.5 text-xs font-medium ${
            destaque ? "text-white/80" : corVariacao
          }`}
        >
          <IconeVariacao size={14} aria-hidden />
          {variacao.texto}
          <span className={destaque ? "text-white/50" : "text-texto-suave"}>
            vs. mês anterior
          </span>
        </p>
      )}

      {rodape && (
        <div
          className={`mt-auto border-t pt-3 text-xs ${
            destaque ? "border-white/15 text-white/70" : "border-borda text-texto-suave"
          }`}
        >
          {rodape}
        </div>
      )}
    </article>
  );
}
