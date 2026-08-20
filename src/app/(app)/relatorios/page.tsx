import type { Metadata } from "next";
import { Suspense } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { GraficoPorCategoria } from "@/components/relatorios/grafico-por-categoria";
import {
  SeletorPeriodo,
  type Periodo,
} from "@/components/relatorios/seletor-periodo";
import { SeletorMes } from "@/components/dashboard/seletor-mes";
import { listarTransacoes, resumoPorCategoria } from "@/lib/dados";
import { formatarData, formatarMes, formatarMoeda } from "@/lib/format";

export const metadata: Metadata = { title: "Relatórios · Fluxx Finance" };

function mesAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

/** Janela de datas e rótulo, conforme o período escolhido. */
function janela(periodo: Periodo, mes: string, de?: string, ate?: string) {
  const [ano, m] = mes.split("-").map(Number);

  if (periodo === "personalizado" && de && ate) {
    const inicio = new Date(`${de}T00:00:00`);
    // `fim` é exclusivo na consulta, então avança um dia para incluir o
    // último dia escolhido.
    const fim = new Date(`${ate}T00:00:00`);
    fim.setDate(fim.getDate() + 1);
    return {
      inicio,
      fim,
      rotulo: `${formatarData(inicio)} a ${formatarData(new Date(`${ate}T00:00:00`))}`,
    };
  }
  if (periodo === "ano") {
    return {
      inicio: new Date(ano, 0, 1),
      fim: new Date(ano + 1, 0, 1),
      rotulo: String(ano),
    };
  }
  if (periodo === "tudo") {
    return { inicio: undefined, fim: undefined, rotulo: "Todo o histórico" };
  }
  return {
    inicio: new Date(ano, m - 1, 1),
    fim: new Date(ano, m, 1),
    rotulo: formatarMes(new Date(ano, m - 1, 1)),
  };
}

export default async function PaginaRelatorios(props: PageProps<"/relatorios">) {
  const sp = await props.searchParams;

  const periodo: Periodo =
    sp.periodo === "ano" || sp.periodo === "tudo" || sp.periodo === "personalizado"
      ? sp.periodo
      : "mes";
  const de = typeof sp.de === "string" ? sp.de : undefined;
  const ate = typeof sp.ate === "string" ? sp.ate : undefined;
  const mes =
    typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesAtual();

  const { inicio, fim, rotulo } = janela(periodo, mes, de, ate);

  const transacoes = await listarTransacoes({ inicio, fim, limite: 20000 });
  const resumo = resumoPorCategoria(transacoes);

  const totalEntradas = resumo.reduce((s, c) => s + c.entradas, 0);
  const totalSaidas = resumo.reduce((s, c) => s + c.saidas, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-texto">
            Relatórios
          </h1>
          <p className="text-sm capitalize text-texto-suave">{rotulo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={<div className="h-10 w-48" />}>
            <SeletorPeriodo periodo={periodo} de={de} ate={ate} />
          </Suspense>
          {(periodo === "mes" || periodo === "ano") && (
            <Suspense fallback={<div className="h-10 w-44" />}>
              <SeletorMes mes={mes} />
            </Suspense>
          )}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="cartao px-5 py-4">
          <p className="flex items-center gap-1.5 text-xs text-texto-suave">
            <TrendingUp size={13} aria-hidden /> Entradas
          </p>
          <p className="valor-sensivel text-xl font-semibold tabular-nums text-entrada">
            {formatarMoeda(totalEntradas)}
          </p>
        </div>
        <div className="cartao px-5 py-4">
          <p className="flex items-center gap-1.5 text-xs text-texto-suave">
            <TrendingDown size={13} aria-hidden /> Saídas
          </p>
          <p className="valor-sensivel text-xl font-semibold tabular-nums text-saida">
            {formatarMoeda(totalSaidas)}
          </p>
        </div>
        <div className="cartao px-5 py-4">
          <p className="text-xs text-texto-suave">Resultado</p>
          <p
            className={`valor-sensivel text-xl font-semibold tabular-nums ${
              totalEntradas - totalSaidas >= 0 ? "text-entrada" : "text-saida"
            }`}
          >
            {formatarMoeda(totalEntradas - totalSaidas)}
          </p>
        </div>
      </section>

      <section className="cartao p-5">
        <h2 className="mb-4 text-sm font-semibold text-texto">
          Entradas e saídas por categoria
        </h2>
        <div className="grafico-sensivel">
          <GraficoPorCategoria dados={resumo} />
        </div>
      </section>

      <section className="cartao overflow-hidden">
        <header className="border-b border-borda px-5 py-4">
          <h2 className="text-sm font-semibold text-texto">Resultado por categoria</h2>
          <p className="mt-1 text-xs text-texto-suave">
            Categorias de entrada e de saída com o mesmo nome aparecem juntas —
            é assim que se vê se um evento se pagou. Transferências entre contas
            ficam de fora.
          </p>
        </header>

        {resumo.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-texto-suave">
            Nenhuma movimentação neste período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-borda text-left text-xs uppercase tracking-wider text-texto-suave">
                  <th className="px-5 py-3 font-medium">Categoria</th>
                  <th className="px-5 py-3 text-right font-medium">Entradas</th>
                  <th className="px-5 py-3 text-right font-medium">Saídas</th>
                  <th className="px-5 py-3 text-right font-medium">Resultado</th>
                  <th className="px-5 py-3 text-right font-medium">Lanç.</th>
                </tr>
              </thead>
              <tbody>
                {resumo.map((c) => (
                  <tr
                    key={c.nome}
                    className="border-b border-borda/60 last:border-0 hover:bg-superficie-2/60"
                  >
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: c.cor }}
                        />
                        <span className="text-texto">{c.nome}</span>
                      </span>
                    </td>
                    <td className="valor-sensivel px-5 py-3 text-right tabular-nums text-entrada">
                      {c.entradas ? formatarMoeda(c.entradas) : "—"}
                    </td>
                    <td className="valor-sensivel px-5 py-3 text-right tabular-nums text-saida">
                      {c.saidas ? formatarMoeda(c.saidas) : "—"}
                    </td>
                    <td
                      className={`valor-sensivel px-5 py-3 text-right font-semibold tabular-nums ${
                        c.resultado >= 0 ? "text-entrada" : "text-saida"
                      }`}
                    >
                      {formatarMoeda(c.resultado)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-texto-suave">
                      {c.lancamentos}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
