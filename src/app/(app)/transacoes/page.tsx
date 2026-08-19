import type { Metadata } from "next";
import { Suspense } from "react";
import { SeletorMes } from "@/components/dashboard/seletor-mes";
import { Filtros } from "@/components/transacoes/filtros";
import { NovaTransacao } from "@/components/transacoes/nova-transacao";
import { TabelaTransacoes } from "@/components/transacoes/tabela-transacoes";
import {
  listarCategorias,
  listarContas,
  listarTransacoes,
  somar,
} from "@/lib/dados";
import { formatarMes, formatarMoeda } from "@/lib/format";
import { obterSessao } from "@/lib/supabase/server";
import { podeEditar, type TipoTransacao } from "@/lib/types";

export const metadata: Metadata = { title: "Transações · Fluxx Finance" };

function mesAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

function texto(valor: string | string[] | undefined): string | undefined {
  return typeof valor === "string" && valor ? valor : undefined;
}

export default async function PaginaTransacoes(props: PageProps<"/transacoes">) {
  const sp = await props.searchParams;

  const mes = /^\d{4}-\d{2}$/.test(texto(sp.mes) ?? "")
    ? (sp.mes as string)
    : mesAtual();
  const [ano, m] = mes.split("-").map(Number);
  const inicio = new Date(ano, m - 1, 1);
  const fim = new Date(ano, m, 1);

  const tipoParam = texto(sp.tipo);
  const tipo =
    tipoParam === "entrada" || tipoParam === "saida"
      ? (tipoParam as TipoTransacao)
      : undefined;

  const sessao = await obterSessao();
  const editavel = podeEditar(sessao?.perfil?.papel);

  const [contas, categorias, transacoes] = await Promise.all([
    listarContas(),
    listarCategorias(),
    listarTransacoes({
      inicio,
      fim,
      tipo,
      contaId: texto(sp.conta),
      categoriaId: texto(sp.categoria),
      busca: texto(sp.busca),
    }),
  ]);

  const entradas = somar(transacoes, "entrada");
  const saidas = somar(transacoes, "saida");
  const semCategoria = transacoes.filter((t) => !t.categoria_id).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-texto">
            Transações
          </h1>
          <p className="text-sm capitalize text-texto-suave">{formatarMes(inicio)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SeletorMes mes={mes} />
          {editavel && <NovaTransacao contas={contas} categorias={categorias} />}
        </div>
      </header>

      <Suspense fallback={<div className="h-10" />}>
        <Filtros contas={contas} categorias={categorias} />
      </Suspense>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="cartao px-5 py-4">
          <p className="text-xs text-texto-suave">Entradas no filtro</p>
          <p className="valor-sensivel text-lg font-semibold tabular-nums text-entrada">
            {formatarMoeda(entradas)}
          </p>
        </div>
        <div className="cartao px-5 py-4">
          <p className="text-xs text-texto-suave">Saídas no filtro</p>
          <p className="valor-sensivel text-lg font-semibold tabular-nums text-saida">
            {formatarMoeda(saidas)}
          </p>
        </div>
        <div className="cartao px-5 py-4">
          <p className="text-xs text-texto-suave">
            {transacoes.length} lançamento{transacoes.length === 1 ? "" : "s"}
          </p>
          <p className="text-lg font-semibold tabular-nums text-texto">
            {semCategoria > 0 ? (
              <span className="text-atencao">{semCategoria} sem categoria</span>
            ) : (
              "Tudo categorizado"
            )}
          </p>
        </div>
      </section>

      <section className="cartao overflow-hidden py-2">
        <TabelaTransacoes
          transacoes={transacoes}
          categorias={categorias}
          editavel={editavel}
        />
      </section>
    </div>
  );
}
