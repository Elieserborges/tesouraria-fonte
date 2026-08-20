import type { Metadata } from "next";
import { Suspense } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { GraficoPorCategoria } from "@/components/relatorios/grafico-por-categoria";
import { SeletorPeriodo } from "@/components/relatorios/seletor-periodo";
import { mesCorrente, rotuloPeriodo } from "@/lib/periodo";
import { listarTransacoes, resumoPorCategoria } from "@/lib/dados";
import { formatarMoeda } from "@/lib/format";
import { contaNoSaldo } from "@/lib/types";

export const metadata: Metadata = { title: "Relatórios · Fluxx Finance" };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export default async function PaginaRelatorios(props: PageProps<"/relatorios">) {
  const sp = await props.searchParams;

  const tudo = sp.periodo === "tudo";
  const padrao = mesCorrente();
  const de = typeof sp.de === "string" && DATA.test(sp.de) ? sp.de : padrao.de;
  const ate = typeof sp.ate === "string" && DATA.test(sp.ate) ? sp.ate : padrao.ate;

  // `fim` é exclusivo na consulta: avança um dia para incluir o último.
  const fimExclusivo = new Date(`${ate}T00:00:00`);
  fimExclusivo.setDate(fimExclusivo.getDate() + 1);

  const transacoes = await listarTransacoes({
    inicio: tudo ? undefined : new Date(`${de}T00:00:00`),
    fim: tudo ? undefined : fimExclusivo,
    limite: 20000,
  });
  const resumo = resumoPorCategoria(transacoes);

  const totalEntradas = resumo.reduce((s, c) => s + c.entradas, 0);
  const totalSaidas = resumo.reduce((s, c) => s + c.saidas, 0);

  /*
   * Tarifas do Mercado Pago no período.
   *
   * Os valores acima já são líquidos — a tarifa nunca entrou na conta. Ela
   * aparece à parte porque a tesouraria precisa saber quanto o meio de
   * pagamento custou, sem que isso vire uma despesa inventada no meio das
   * categorias.
   */
  const totalTarifas = transacoes.reduce(
    (soma, t) => (contaNoSaldo(t.status) ? soma + Number(t.tarifa ?? 0) : soma),
    0,
  );
  const totalBruto = totalEntradas + totalTarifas;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-texto">Relatórios</h1>
          <p className="text-sm capitalize text-texto-suave">
            {rotuloPeriodo(de, ate, tudo)}
          </p>
        </div>
        <Suspense fallback={<div className="h-10 w-56" />}>
          <SeletorPeriodo de={tudo ? undefined : de} ate={tudo ? undefined : ate} tudo={tudo} />
        </Suspense>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <p className="text-xs text-texto-suave">Tarifas</p>
          <p className="valor-sensivel text-xl font-semibold tabular-nums text-texto-suave">
            {formatarMoeda(totalTarifas)}
          </p>
          <p className="mt-0.5 text-[0.7rem] text-texto-suave">
            {totalTarifas > 0
              ? `retido de ${formatarMoeda(totalBruto)} cobrados`
              : "nenhuma no período"}
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
