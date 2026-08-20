import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, PiggyBank, TrendingDown, TrendingUp } from "lucide-react";
import { AlternarValores } from "@/components/shell/alternar-valores";
import { CartaoMetrica } from "@/components/dashboard/cartao-metrica";
import { GraficoFluxo } from "@/components/dashboard/grafico-fluxo";
import { GraficoCategorias } from "@/components/dashboard/grafico-categorias";
import { SeletorPeriodo } from "@/components/relatorios/seletor-periodo";
import { TabelaTransacoes } from "@/components/transacoes/tabela-transacoes";
import {
  fluxoDoPeriodo,
  listarCategorias,
  listarSaldosPorConta,
  listarTransacoes,
  porCategoria,
  somar,
  somarMovimentoBancario,
  somarTransferencias,
} from "@/lib/dados";
import { formatarMoeda } from "@/lib/format";
import { janelaDaUrl, periodoAnterior } from "@/lib/periodo";
import { obterSessao } from "@/lib/supabase/server";
import { podeEditar } from "@/lib/types";

export const metadata: Metadata = { title: "Visão geral · Fluxx Finance" };

export default async function PaginaDashboard(props: PageProps<"/dashboard">) {
  const sp = await props.searchParams;
  const { tudo, de, ate, inicio, fim, rotulo } = janelaDaUrl(sp);

  const sessao = await obterSessao();
  const editavel = podeEditar(sessao?.perfil?.papel);

  const anterior = inicio && fim ? periodoAnterior(inicio, fim) : null;

  const [saldos, categorias, doPeriodo, doAnterior] = await Promise.all([
    listarSaldosPorConta(),
    listarCategorias(),
    listarTransacoes({ inicio, fim, limite: 20000 }),
    anterior
      ? listarTransacoes({ inicio: anterior.inicio, fim: anterior.fim, limite: 20000 })
      : Promise.resolve([]),
  ]);

  const saldoTotal = saldos.reduce((total, c) => total + c.saldo, 0);
  const entradas = somar(doPeriodo, "entrada");
  const saidas = somar(doPeriodo, "saida");
  const entradasAnterior = somar(doAnterior, "entrada");
  const saidasAnterior = somar(doAnterior, "saida");
  const resultado = entradas - saidas;
  const entradasTransferidas = somarTransferencias(doPeriodo, "entrada");
  const saidasTransferidas = somarTransferencias(doPeriodo, "saida");
  const transferido = entradasTransferidas + saidasTransferidas;

  // Para comparar com o extrato do banco só valem as contas por onde o
  // dinheiro realmente passa. O cofrinho é reserva: nem as duas pontas da
  // transferência nem o rendimento dele aparecem no extrato.
  const entradasNaConta = somarMovimentoBancario(doPeriodo, "entrada");
  const saidasNaConta = somarMovimentoBancario(doPeriodo, "saida");

  // Em "Todo o período" não há janela na URL: o gráfico usa as pontas dos
  // próprios dados.
  const tempos = doPeriodo.map((t) => new Date(t.ocorrido_em).getTime());
  const fluxo = tempos.length
    ? fluxoDoPeriodo(
        doPeriodo,
        inicio ?? new Date(Math.min(...tempos)),
        fim ?? new Date(Math.max(...tempos) + 86400000),
      )
    : [];
  const despesas = porCategoria(doPeriodo, "saida");
  const recentes = doPeriodo.slice(0, 8);

  const linkTransacoes = tudo
    ? "/transacoes?periodo=tudo"
    : `/transacoes?de=${de}&ate=${ate}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-texto">Visão geral</h1>
          <p className="text-sm capitalize text-texto-suave">{rotulo}</p>
        </div>
        <SeletorPeriodo de={tudo ? undefined : de} ate={tudo ? undefined : ate} tudo={tudo} />
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoMetrica
          titulo="Saldo atual"
          subtitulo="Todas as datas — não muda com o período"
          valor={saldoTotal}
          destaque
          icone={<AlternarValores sutil />}
          rodape={
            <ul className="space-y-1">
              {saldos.map((c) => (
                <li key={c.conta_id} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: c.conta_cor }}
                  />
                  <span className="flex-1 truncate">{c.conta_nome}</span>
                  <span className="tabular-nums">{formatarMoeda(c.saldo)}</span>
                </li>
              ))}
            </ul>
          }
        />
        {/*
          O rodapé mostra o total com as transferências somadas.

          Os cartões respondem "quanto foi receita e despesa", que é a pergunta
          da prestação de contas. O extrato do banco responde outra: "quanto
          passou pela conta" — e inclui o que só mudou de lugar, como o dinheiro
          guardado no cofrinho. Sem os dois números lado a lado, conferir com o
          aplicativo do banco vira adivinhação.
        */}
        <CartaoMetrica
          titulo="Entradas"
          valor={entradas}
          anterior={anterior ? entradasAnterior : undefined}
          sentido="positivo"
          icone={<TrendingUp size={18} />}
          rodape={
            entradasTransferidas > 0 ? (
              <span>
                {formatarMoeda(entradasNaConta)} passaram pela conta,
                contando transferências.
              </span>
            ) : undefined
          }
        />
        <CartaoMetrica
          titulo="Saídas"
          valor={saidas}
          anterior={anterior ? saidasAnterior : undefined}
          sentido="negativo"
          icone={<TrendingDown size={18} />}
          rodape={
            saidasTransferidas > 0 ? (
              <span>
                {formatarMoeda(saidasNaConta)} saíram da conta,
                contando transferências.
              </span>
            ) : undefined
          }
        />
        <CartaoMetrica
          titulo="Resultado"
          valor={resultado}
          anterior={anterior ? entradasAnterior - saidasAnterior : undefined}
          sentido="positivo"
          icone={<PiggyBank size={18} />}
          rodape={
            <span>
              {transferido > 0 ? (
                <>
                  Fora {formatarMoeda(transferido)} em transferências entre contas
                  da igreja, que mexem no saldo mas não são receita nem despesa.
                </>
              ) : resultado >= 0 ? (
                "Entradas superaram as saídas no período."
              ) : (
                "As saídas superaram as entradas no período."
              )}
            </span>
          }
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <div className="cartao p-5 xl:col-span-3">
          <h2 className="mb-4 text-sm font-semibold text-texto">Fluxo de caixa</h2>
          <div className="grafico-sensivel">
            <GraficoFluxo dados={fluxo} />
          </div>
        </div>

        <div className="cartao p-5 xl:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-texto">Saídas por categoria</h2>
          <div className="grafico-sensivel">
            <GraficoCategorias dados={despesas} />
          </div>
        </div>
      </section>

      <section className="cartao overflow-hidden">
        <header className="flex items-center justify-between gap-4 px-5 py-4">
          <h2 className="text-sm font-semibold text-texto">Movimentações recentes</h2>
          <Link
            href={linkTransacoes}
            className="flex items-center gap-1.5 text-sm font-medium text-primaria transition hover:opacity-80"
          >
            Ver todas
            <ArrowRight size={15} aria-hidden />
          </Link>
        </header>
        <TabelaTransacoes
          transacoes={recentes}
          categorias={categorias}
          editavel={editavel}
          compacta
        />
      </section>
    </div>
  );
}
