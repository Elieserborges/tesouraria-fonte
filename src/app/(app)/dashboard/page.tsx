import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { CartaoMetrica } from "@/components/dashboard/cartao-metrica";
import { GraficoFluxo } from "@/components/dashboard/grafico-fluxo";
import { GraficoCategorias } from "@/components/dashboard/grafico-categorias";
import { SeletorMes } from "@/components/dashboard/seletor-mes";
import { TabelaTransacoes } from "@/components/transacoes/tabela-transacoes";
import {
  fluxoDiario,
  listarCategorias,
  listarSaldosPorConta,
  listarTransacoes,
  porCategoria,
  somar,
} from "@/lib/dados";
import { formatarMes, formatarMoeda } from "@/lib/format";
import { obterSessao } from "@/lib/supabase/server";
import { podeEditar } from "@/lib/types";

export const metadata: Metadata = { title: "Visão geral · Tesouraria Fonte" };

/** "2026-08" -> [1º de agosto, 1º de setembro) no fuso local. */
function intervaloDoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  return {
    inicio: new Date(ano, m - 1, 1),
    fim: new Date(ano, m, 1),
    inicioAnterior: new Date(ano, m - 2, 1),
  };
}

function mesAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

export default async function PaginaDashboard(props: PageProps<"/dashboard">) {
  const { mes: mesParam } = await props.searchParams;
  const mes =
    typeof mesParam === "string" && /^\d{4}-\d{2}$/.test(mesParam)
      ? mesParam
      : mesAtual();

  const { inicio, fim, inicioAnterior } = intervaloDoMes(mes);

  const sessao = await obterSessao();
  const editavel = podeEditar(sessao?.perfil?.papel);

  const [saldos, categorias, doMes, doMesAnterior] = await Promise.all([
    listarSaldosPorConta(),
    listarCategorias(),
    listarTransacoes({ inicio, fim }),
    listarTransacoes({ inicio: inicioAnterior, fim: inicio }),
  ]);

  const saldoTotal = saldos.reduce((total, c) => total + c.saldo, 0);
  const entradas = somar(doMes, "entrada");
  const saidas = somar(doMes, "saida");
  const entradasAnterior = somar(doMesAnterior, "entrada");
  const saidasAnterior = somar(doMesAnterior, "saida");
  const resultado = entradas - saidas;

  const fluxo = fluxoDiario(doMes, inicio, fim);
  const despesas = porCategoria(doMes, "saida");
  const recentes = doMes.slice(0, 8);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-texto">
            Visão geral
          </h1>
          <p className="text-sm capitalize text-texto-suave">
            {formatarMes(inicio)}
          </p>
        </div>
        <SeletorMes mes={mes} />
      </header>

      {/* Cartões de saldo */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoMetrica
          titulo="Saldo total acumulado"
          valor={saldoTotal}
          destaque
          icone={<Wallet size={18} />}
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
        <CartaoMetrica
          titulo="Entradas do mês"
          valor={entradas}
          anterior={entradasAnterior}
          sentido="positivo"
          icone={<TrendingUp size={18} />}
        />
        <CartaoMetrica
          titulo="Saídas do mês"
          valor={saidas}
          anterior={saidasAnterior}
          sentido="negativo"
          icone={<TrendingDown size={18} />}
        />
        <CartaoMetrica
          titulo="Resultado do mês"
          valor={resultado}
          anterior={entradasAnterior - saidasAnterior}
          sentido="positivo"
          icone={<PiggyBank size={18} />}
          rodape={
            <span>
              {resultado >= 0
                ? "Entradas superaram as saídas no período."
                : "As saídas superaram as entradas no período."}
            </span>
          }
        />
      </section>

      {/* Gráficos */}
      <section className="grid gap-4 xl:grid-cols-5">
        <div className="cartao p-5 xl:col-span-3">
          <h2 className="mb-4 text-sm font-semibold text-texto">
            Fluxo de caixa diário
          </h2>
          <GraficoFluxo dados={fluxo} />
        </div>

        <div className="cartao p-5 xl:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-texto">
            Saídas por categoria
          </h2>
          <GraficoCategorias dados={despesas} />
        </div>
      </section>

      {/* Últimas transações */}
      <section className="cartao overflow-hidden">
        <header className="flex items-center justify-between gap-4 px-5 py-4">
          <h2 className="text-sm font-semibold text-texto">
            Movimentações recentes
          </h2>
          <Link
            href={`/transacoes?mes=${mes}`}
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
