import type { Metadata } from "next";
import { OpcoesExportacao } from "@/components/exportar/opcoes-exportacao";
import { listarTransacoes, somar } from "@/lib/dados";
import { formatarMoeda } from "@/lib/format";
import { contaNoSaldo } from "@/lib/types";
import { janelaDaUrl } from "@/lib/periodo";
import { SeletorPeriodo } from "@/components/relatorios/seletor-periodo";

export const metadata: Metadata = { title: "Exportar · Fluxx Finance" };

export default async function PaginaExportar(props: PageProps<"/exportar">) {
  const sp = await props.searchParams;
  const { tudo, de, ate, inicio, fim, rotulo } = janelaDaUrl(sp);

  const transacoes = await listarTransacoes({ inicio, fim, limite: 50000 });
  const aprovadas = transacoes.filter((t) => contaNoSaldo(t.status));

  const consulta = tudo ? "periodo=tudo" : `de=${de}&ate=${ate}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-texto">Exportar</h1>
          <p className="text-sm capitalize text-texto-suave">{rotulo}</p>
        </div>
        <SeletorPeriodo de={tudo ? undefined : de} ate={tudo ? undefined : ate} tudo={tudo} />
      </header>

      <section className="cartao grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-texto-suave">Lançamentos no período</p>
          <p className="text-lg font-semibold tabular-nums text-texto">{aprovadas.length}</p>
        </div>
        <div>
          <p className="text-xs text-texto-suave">Entradas</p>
          <p className="valor-sensivel text-lg font-semibold tabular-nums text-entrada">
            {formatarMoeda(somar(transacoes, "entrada"))}
          </p>
        </div>
        <div>
          <p className="text-xs text-texto-suave">Saídas</p>
          <p className="valor-sensivel text-lg font-semibold tabular-nums text-saida">
            {formatarMoeda(somar(transacoes, "saida"))}
          </p>
        </div>
      </section>

      <OpcoesExportacao consulta={consulta} lancamentos={aprovadas.length} />
    </div>
  );
}
