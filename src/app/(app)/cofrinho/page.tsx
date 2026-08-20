import type { Metadata } from "next";
import { ArrowDownToLine, ArrowUpFromLine, PiggyBank, Sprout } from "lucide-react";
import { AlternarValores } from "@/components/shell/alternar-valores";
import { CartaoMetrica } from "@/components/dashboard/cartao-metrica";
import { TabelaTransacoes } from "@/components/transacoes/tabela-transacoes";
import { listarCategorias, listarSaldosPorConta, listarTransacoes, idsDasContasDeReserva } from "@/lib/dados";
import { formatarMoeda } from "@/lib/format";
import { contaNoSaldo, ehTransferencia } from "@/lib/types";

export const metadata: Metadata = { title: "Cofrinho · Fluxx Finance" };

/**
 * O dinheiro guardado, à parte do caixa.
 *
 * O cofrinho do Mercado Pago é uma reserva dentro da mesma conta: rende, mas
 * não paga nada — para usar, é preciso trazer de volta primeiro. Por isso ele
 * tem aba própria e não entra no saldo da Visão geral: um total somando os
 * dois diria que a igreja tem mais disponível do que realmente tem.
 *
 * Aqui não há filtro de período de propósito. A pergunta que esta tela
 * responde é "quanto está guardado", que não depende de janela de tempo.
 */
export default async function PaginaCofrinho() {
  const [saldos, idsDeReserva, categorias, movimentos] = await Promise.all([
    listarSaldosPorConta(),
    idsDasContasDeReserva(),
    listarCategorias(),
    listarTransacoes({ reservas: "somente", limite: 5000 }),
  ]);

  const reservas = saldos.filter((c) => idsDeReserva.includes(c.conta_id));
  const total = reservas.reduce((soma, c) => soma + c.saldo, 0);

  // As transferências são o vaivém com a conta corrente. O que sobra é
  // rendimento: nasceu dentro do cofrinho e nunca passou pelo caixa.
  const guardado = movimentos
    .filter((t) => t.tipo === "entrada" && contaNoSaldo(t.status) && ehTransferencia(t))
    .reduce((soma, t) => soma + t.valor, 0);
  const resgatado = movimentos
    .filter((t) => t.tipo === "saida" && contaNoSaldo(t.status) && ehTransferencia(t))
    .reduce((soma, t) => soma + t.valor, 0);
  const rendimento = movimentos
    .filter((t) => t.tipo === "entrada" && contaNoSaldo(t.status) && !ehTransferencia(t))
    .reduce((soma, t) => soma + t.valor, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-texto">Cofrinho</h1>
        <p className="text-sm text-texto-suave">
          Reserva da igreja. Não entra no saldo disponível — para usar, precisa voltar
          para a conta primeiro.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoMetrica
          titulo="Guardado hoje"
          valor={total}
          destaque
          icone={<AlternarValores sutil />}
          rodape={
            <ul className="space-y-1">
              {reservas.map((c) => (
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
          titulo="Já foi guardado"
          valor={guardado}
          sentido="positivo"
          icone={<ArrowDownToLine size={18} />}
          rodape={<span>Somando tudo que saiu da conta para cá.</span>}
        />
        <CartaoMetrica
          titulo="Já voltou"
          valor={resgatado}
          sentido="negativo"
          icone={<ArrowUpFromLine size={18} />}
          rodape={<span>Resgatado para a conta corrente.</span>}
        />
        <CartaoMetrica
          titulo="Rendimento"
          valor={rendimento}
          sentido="positivo"
          icone={<Sprout size={18} />}
          rodape={
            <span>
              Receita da igreja que nasceu aqui dentro e nunca passou pela conta.
            </span>
          }
        />
      </section>

      <section className="cartao overflow-hidden">
        <header className="flex items-center gap-2 px-5 py-4">
          <PiggyBank size={15} aria-hidden className="text-texto-suave" />
          <h2 className="text-sm font-semibold text-texto">Movimentações</h2>
          <span className="text-xs text-texto-suave">{movimentos.length}</span>
        </header>
        <TabelaTransacoes
          transacoes={movimentos}
          categorias={categorias}
          editavel={false}
        />
      </section>
    </div>
  );
}
