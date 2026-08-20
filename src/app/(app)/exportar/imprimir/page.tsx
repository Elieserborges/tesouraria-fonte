import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { BotaoImprimir } from "@/components/exportar/botao-imprimir";
import {
  fluxoDoPeriodo,
  listarEventos,
  listarSaldosPorConta,
  listarTransacoes,
  resumoPorCategoria,
  somar,
  somarTransferencias,
} from "@/lib/dados";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/format";
import { janelaDaUrl } from "@/lib/periodo";
import { obterSessao } from "@/lib/supabase/server";
import { FORMA_LABEL, type FormaPagamento } from "@/lib/types";

export const metadata: Metadata = { title: "Relatório · Fluxx Finance" };

/** Quantas transações listar no anexo antes de virar volume impróprio. */
const MAX_DETALHE = 400;

export default async function RelatorioImpresso(props: PageProps<"/exportar/imprimir">) {
  const sp = await props.searchParams;
  const { inicio, fim, de, ate, tudo, rotulo } = janelaDaUrl(sp);
  const detalhado = sp.modelo !== "resumo";

  const sessao = await obterSessao();

  const [transacoes, saldos, eventos] = await Promise.all([
    listarTransacoes({ inicio, fim, limite: 50000 }),
    listarSaldosPorConta(),
    listarEventos(),
  ]);

  const entradas = somar(transacoes, "entrada");
  const saidas = somar(transacoes, "saida");
  const resultado = entradas - saidas;
  const transferido =
    somarTransferencias(transacoes, "saida") + somarTransferencias(transacoes, "entrada");
  const saldoTotal = saldos.reduce((s, c) => s + c.saldo, 0);

  const resumo = resumoPorCategoria(transacoes);
  const aprovadas = transacoes.filter((t) => t.status === "approved");

  const tempos = transacoes.map((t) => new Date(t.ocorrido_em).getTime());
  const fluxo = tempos.length
    ? fluxoDoPeriodo(
        transacoes,
        inicio ?? new Date(Math.min(...tempos)),
        fim ?? new Date(Math.max(...tempos) + 86400000),
      )
    : [];

  // Só as edições que tocam o período do relatório.
  const eventosDoPeriodo = eventos.filter(
    (e) => tudo || (e.inicio <= ate && e.fim >= de),
  );

  const porForma = new Map<string, { n: number; entradas: number; saidas: number }>();
  for (const t of aprovadas) {
    const k = t.forma ?? "outros";
    const g = porForma.get(k) ?? { n: 0, entradas: 0, saidas: 0 };
    g.n += 1;
    if (t.tipo === "entrada") g.entradas += t.valor;
    else g.saidas += t.valor;
    porForma.set(k, g);
  }

  const th = "px-3 py-2 text-left text-[11px] uppercase tracking-wide font-semibold text-texto-suave";
  const td = "px-3 py-1.5 align-top";

  return (
    <div className="mx-auto max-w-[210mm] space-y-6 text-texto">
      <BotaoImprimir />

      {/* Cabeçalho */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-texto pb-4">
        <div>
          <Logo className="text-texto" />
          <p className="mt-3 text-lg font-semibold">Relatório financeiro</p>
          <p className="text-sm capitalize text-texto-suave">{rotulo}</p>
        </div>
        <div className="text-right text-xs text-texto-suave">
          <p className="font-medium text-texto">Comunidade Cristã Fonte da Vida</p>
          <p>CNPJ 07.913.258/0001-28</p>
          <p className="mt-2">Emitido em {formatarDataHora(new Date())}</p>
          {sessao?.perfil?.nome && <p>por {sessao.perfil.nome}</p>}
        </div>
      </header>

      {/* Resumo */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Resumo</h2>
        <div className="grid grid-cols-4 gap-3">
          {[
            { r: "Entradas", v: entradas, c: "text-entrada" },
            { r: "Saídas", v: saidas, c: "text-saida" },
            { r: "Resultado", v: resultado, c: resultado >= 0 ? "text-entrada" : "text-saida" },
            { r: "Saldo atual", v: saldoTotal, c: "text-texto" },
          ].map((x) => (
            <div key={x.r} className="cartao px-3 py-2">
              <p className="text-[11px] text-texto-suave">{x.r}</p>
              <p className={`text-base font-semibold tabular-nums ${x.c}`}>
                {formatarMoeda(x.v)}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-2 text-xs leading-relaxed text-texto-suave">
          O <strong>resultado</strong> é a diferença entre entradas e saídas do
          período. O <strong>saldo atual</strong> é o que existe hoje nas contas,
          somando todo o histórico — por isso os dois não coincidem.
          {transferido > 0 && (
            <>
              {" "}Ficaram de fora {formatarMoeda(transferido)} em transferências
              entre contas da própria igreja, que mudam o saldo de cada conta mas
              não são receita nem despesa.
            </>
          )}
        </p>
      </section>

      {/* Por categoria */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
          Resultado por categoria
        </h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-y border-borda bg-superficie-2">
              <th className={th}>Categoria</th>
              <th className={`${th} text-right`}>Entradas</th>
              <th className={`${th} text-right`}>Saídas</th>
              <th className={`${th} text-right`}>Resultado</th>
              <th className={`${th} text-right`}>Lanç.</th>
            </tr>
          </thead>
          <tbody>
            {resumo.map((c) => (
              <tr key={c.nome} className="border-b border-borda/60">
                <td className={td}>{c.nome}</td>
                <td className={`${td} text-right tabular-nums text-entrada`}>
                  {c.entradas ? formatarMoeda(c.entradas) : "—"}
                </td>
                <td className={`${td} text-right tabular-nums text-saida`}>
                  {c.saidas ? formatarMoeda(c.saidas) : "—"}
                </td>
                <td
                  className={`${td} text-right font-semibold tabular-nums ${
                    c.resultado >= 0 ? "text-entrada" : "text-saida"
                  }`}
                >
                  {formatarMoeda(c.resultado)}
                </td>
                <td className={`${td} text-right tabular-nums`}>{c.lancamentos}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-texto font-semibold">
              <td className={td}>Total</td>
              <td className={`${td} text-right tabular-nums text-entrada`}>
                {formatarMoeda(entradas)}
              </td>
              <td className={`${td} text-right tabular-nums text-saida`}>
                {formatarMoeda(saidas)}
              </td>
              <td className={`${td} text-right tabular-nums`}>{formatarMoeda(resultado)}</td>
              <td className={`${td} text-right tabular-nums`}>{aprovadas.length}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* Como entrou e saiu */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
          Por forma de pagamento
        </h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-y border-borda bg-superficie-2">
              <th className={th}>Forma</th>
              <th className={`${th} text-right`}>Entradas</th>
              <th className={`${th} text-right`}>Saídas</th>
              <th className={`${th} text-right`}>Lanç.</th>
            </tr>
          </thead>
          <tbody>
            {[...porForma.entries()]
              .sort((a, b) => b[1].entradas + b[1].saidas - (a[1].entradas + a[1].saidas))
              .map(([forma, g]) => (
                <tr key={forma} className="border-b border-borda/60">
                  <td className={td}>
                    {FORMA_LABEL[forma as FormaPagamento] ?? forma}
                  </td>
                  <td className={`${td} text-right tabular-nums text-entrada`}>
                    {g.entradas ? formatarMoeda(g.entradas) : "—"}
                  </td>
                  <td className={`${td} text-right tabular-nums text-saida`}>
                    {g.saidas ? formatarMoeda(g.saidas) : "—"}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{g.n}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      {/* Eventos */}
      {eventosDoPeriodo.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Eventos</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y border-borda bg-superficie-2">
                <th className={th}>Edição</th>
                <th className={th}>Janela</th>
                <th className={`${th} text-right`}>Arrecadado</th>
                <th className={`${th} text-right`}>Gasto</th>
                <th className={`${th} text-right`}>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {eventosDoPeriodo.map((e) => (
                <tr key={e.evento_id} className="border-b border-borda/60">
                  <td className={td}>
                    {e.nome}
                    {e.observacao && (
                      <span className="block text-[10px] text-texto-suave">{e.observacao}</span>
                    )}
                  </td>
                  <td className={`${td} tabular-nums text-texto-suave`}>
                    {formatarData(new Date(`${e.inicio}T12:00:00`))} a{" "}
                    {formatarData(new Date(`${e.fim}T12:00:00`))}
                  </td>
                  <td className={`${td} text-right tabular-nums text-entrada`}>
                    {formatarMoeda(e.entradas)}
                  </td>
                  <td className={`${td} text-right tabular-nums text-saida`}>
                    {formatarMoeda(e.saidas)}
                  </td>
                  <td
                    className={`${td} text-right font-semibold tabular-nums ${
                      e.resultado >= 0 ? "text-entrada" : "text-saida"
                    }`}
                  >
                    {formatarMoeda(e.resultado)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Evolução */}
      {fluxo.length > 1 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Evolução</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y border-borda bg-superficie-2">
                <th className={th}>Período</th>
                <th className={`${th} text-right`}>Entradas</th>
                <th className={`${th} text-right`}>Saídas</th>
                <th className={`${th} text-right`}>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {/* Sem filtrar os zerados: um dia sem movimento é informação,
                  e pular datas faz a tabela parecer incompleta. */}
              {fluxo.map((p) => (
                <tr key={p.dia} className="border-b border-borda/60">
                  <td className={td}>{p.rotulo}</td>
                  <td className={`${td} text-right tabular-nums text-entrada`}>
                    {p.entradas ? formatarMoeda(p.entradas) : "—"}
                  </td>
                  <td className={`${td} text-right tabular-nums text-saida`}>
                    {p.saidas ? formatarMoeda(p.saidas) : "—"}
                  </td>
                  <td
                    className={`${td} text-right tabular-nums ${
                      p.entradas - p.saidas >= 0 ? "text-entrada" : "text-saida"
                    }`}
                  >
                    {p.entradas || p.saidas ? formatarMoeda(p.entradas - p.saidas) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Anexo com os lançamentos */}
      {detalhado && aprovadas.length > 0 && (
        <section className="quebra-pagina">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
            Anexo — lançamentos do período
          </h2>
          {aprovadas.length > MAX_DETALHE && (
            <p className="mb-2 text-xs text-texto-suave">
              Mostrando os {MAX_DETALHE} mais recentes de {aprovadas.length}. Para a
              lista completa, use a exportação em planilha.
            </p>
          )}
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-y border-borda bg-superficie-2">
                <th className={th}>Data</th>
                <th className={th}>Descrição</th>
                <th className={th}>Categoria</th>
                <th className={th}>Forma</th>
                <th className={`${th} text-right`}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {aprovadas.slice(0, MAX_DETALHE).map((t) => (
                <tr key={t.id} className="border-b border-borda/50">
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {formatarData(t.ocorrido_em)}
                  </td>
                  <td className={td}>
                    {t.descricao || (t.tipo === "entrada" ? "Entrada" : "Saída")}
                    {t.contraparte && (
                      <span className="block text-[10px] text-texto-suave">
                        {t.contraparte}
                      </span>
                    )}
                  </td>
                  <td className={td}>{t.categoria?.nome ?? "—"}</td>
                  <td className={td}>
                    {t.forma ? (FORMA_LABEL[t.forma as FormaPagamento] ?? t.forma) : "—"}
                  </td>
                  <td
                    className={`${td} whitespace-nowrap text-right font-medium tabular-nums ${
                      t.tipo === "entrada" ? "text-entrada" : "text-saida"
                    }`}
                  >
                    {t.tipo === "entrada" ? "+" : "−"} {formatarMoeda(t.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="border-t border-borda pt-4 text-[10px] text-texto-suave">
        <p>
          Documento gerado pelo Fluxx Finance a partir das movimentações
          registradas. Valores em reais. Apenas lançamentos aprovados entram nos
          totais; pendentes e estornados ficam de fora.
        </p>
        <div className="mt-10 grid grid-cols-2 gap-12">
          {["Tesouraria", "Conselho Fiscal"].map((papel) => (
            <div key={papel} className="border-t border-texto pt-1 text-center">
              {papel}
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
