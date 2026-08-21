"use client";

import { useState, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight, Trash2, Wand2, Zap } from "lucide-react";
import { formatarDataHora, formatarMoeda } from "@/lib/format";
import {
  aguardandoCaptura,
  FORMA_LABEL,
  nomeUtil,
  type Categoria,
  type TransacaoComRelacoes,
} from "@/lib/types";
import { atribuirCategoria, excluirTransacao } from "@/app/(app)/transacoes/actions";

type Props = {
  transacoes: TransacaoComRelacoes[];
  categorias: Categoria[];
  editavel: boolean;
  /** Esconde a coluna de categoria editável (usado no resumo do dashboard). */
  compacta?: boolean;
};

export function TabelaTransacoes({
  transacoes,
  categorias,
  editavel,
  compacta = false,
}: Props) {
  const [pendente, iniciarTransicao] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function mudarCategoria(transacaoId: string, valor: string) {
    setErro(null);
    setAviso(null);
    iniciarTransicao(async () => {
      const r = await atribuirCategoria(transacaoId, valor || null);
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      if (r.excecao) {
        setAviso(
          `Aplicado só nesta linha. Já existe uma regra mandando as transações ` +
            `com esta descrição para "${r.excecao}" — mudar a regra inteira se faz ` +
            `em Categorias, para não arrastar as outras sem querer.`,
        );
      } else if (r.semRegra) {
        setAviso(
          "Categoria aplicada só nesta linha. Como a transação não tem " +
            "descrição, não dá para criar regra: o 'vazio' casaria com todos " +
            "os outros Pix sem identificação.",
        );
      } else if (r.tambem && r.tambem > 0) {
        setAviso(
          r.tambem === 1
            ? "Outra transação com a mesma descrição também foi categorizada. A regra vale para as próximas."
            : `${r.tambem} transações com a mesma descrição também foram categorizadas. ` +
              "A regra vale para as próximas.",
        );
      }
    });
  }

  function remover(transacaoId: string) {
    if (!confirm("Excluir este lançamento manual? A ação não pode ser desfeita."))
      return;
    setErro(null);
    iniciarTransicao(async () => {
      const r = await excluirTransacao(transacaoId);
      if (r.erro) setErro(r.erro);
    });
  }

  if (transacoes.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-texto-suave">
        Nenhuma transação encontrada com os filtros atuais.
      </p>
    );
  }

  return (
    <div className={pendente ? "opacity-60 transition-opacity" : "transition-opacity"}>
      {erro && (
        <p role="alert" className="mx-5 mb-3 rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">
          {erro}
        </p>
      )}

      {aviso && (
        <p className="mx-5 mb-3 flex items-start gap-2 rounded-lg bg-verde-400/10 px-3 py-2 text-sm text-entrada">
          <Wand2 size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {aviso}{" "}
            <a href="/categorias" className="underline underline-offset-2">
              Ver regras
            </a>
          </span>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-borda text-left text-xs uppercase tracking-wider text-texto-suave">
              <th className="px-5 py-3 font-medium">Data</th>
              <th className="px-5 py-3 font-medium">Descrição</th>
              <th className="px-5 py-3 font-medium">Conta</th>
              {!compacta && <th className="px-5 py-3 font-medium">Categoria</th>}
              <th className="px-5 py-3 text-right font-medium">Valor</th>
              {!compacta && editavel && <th className="w-12 px-5 py-3" />}
            </tr>
          </thead>
          <tbody>
            {transacoes.map((t) => {
              const entrada = t.tipo === "entrada";
              return (
                <tr
                  key={t.id}
                  className="border-b border-borda/60 last:border-0 hover:bg-superficie-2/60"
                >
                  <td className="whitespace-nowrap px-5 py-3 text-texto-suave tabular-nums">
                    {formatarDataHora(t.ocorrido_em)}
                  </td>

                  {/*
                    max-w-0 + w-full faz esta coluna absorver o espaço que
                    sobra e, principalmente, permite que o texto seja cortado
                    com reticências. Sem isso uma descrição longa estica a
                    tabela e empurra a coluna de categoria para fora da tela.
                  */}
                  <td className="w-full max-w-0 px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className={`grid size-7 shrink-0 place-items-center rounded-full ${
                          entrada ? "bg-verde-400/15 text-entrada" : "bg-alerta/12 text-saida"
                        }`}
                      >
                        {entrada ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate font-medium text-texto"
                          title={t.descricao ?? undefined}
                        >
                          {t.descricao || (entrada ? "Entrada" : "Saída")}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-texto-suave">
                          {t.forma && (
                            <span className="shrink-0 rounded bg-superficie-2 px-1.5 py-0.5">
                              {FORMA_LABEL[t.forma] ?? t.forma}
                            </span>
                          )}
                          {/*
                            O nome mascarado não vira texto na tela.
                            A API devolve "XXXXXXXXXXX" quando não pode
                            revelar quem pagou; mostrar isso ocupa espaço
                            para dizer menos que o vazio.
                          */}
                          {nomeUtil(t.contraparte) && (
                            <span className="truncate">{t.contraparte}</span>
                          )}
                        </span>
                      </span>
                      {t.origem === "mercadopago" && (
                        <span
                          title="Recebida automaticamente do Mercado Pago"
                          className="ml-1 shrink-0 text-marca-400"
                        >
                          <Zap size={13} />
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-5 py-3">
                    <span className="inline-flex items-center gap-2 text-texto-suave">
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ backgroundColor: t.conta?.cor ?? "#94A3B8" }}
                      />
                      {t.conta?.nome ?? "—"}
                    </span>
                  </td>

                  {!compacta && (
                    <td className="px-5 py-3">
                      {editavel ? (
                        <select
                          value={t.categoria_id ?? ""}
                          onChange={(e) => mudarCategoria(t.id, e.target.value)}
                          aria-label={`Categoria de ${t.descricao ?? "transação"}`}
                          className={`w-full max-w-52 rounded-lg border px-2.5 py-1.5 text-sm outline-none transition focus:border-primaria focus:ring-2 focus:ring-primaria/25 ${
                            t.categoria_id
                              ? "border-borda bg-superficie text-texto"
                              : "border-atencao/50 bg-atencao/10 text-atencao"
                          }`}
                        >
                          <option value="">Sem categoria</option>
                          {categorias
                            .filter((c) => c.tipo === t.tipo)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nome}
                              </option>
                            ))}
                        </select>
                      ) : t.categoria ? (
                        <span
                          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{
                            backgroundColor: `${t.categoria.cor}1f`,
                            color: t.categoria.cor,
                          }}
                        >
                          {t.categoria.nome}
                        </span>
                      ) : (
                        <span className="text-xs text-texto-suave">Sem categoria</span>
                      )}
                    </td>
                  )}

                  <td
                    className={`valor-sensivel whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums ${
                      entrada ? "text-entrada" : "text-saida"
                    }`}
                  >
                    {entrada ? "+" : "−"} {formatarMoeda(t.valor)}
                    {/*
                      Compra bloqueada no cartão: o valor já saiu do disponível,
                      mas o lojista ainda não capturou. Some do extrato até lá,
                      e pode voltar se a autorização expirar.
                    */}
                    {aguardandoCaptura(t.status) && (
                      <span
                        className="ml-1.5 align-middle text-[0.65rem] font-medium uppercase tracking-wide text-texto-suave"
                        title="O valor já saiu do saldo disponível, mas a loja ainda não fechou a cobrança. Some do extrato até lá, e volta se a autorização expirar."
                      >
                        aguardando
                      </span>
                    )}
                  </td>

                  {!compacta && editavel && (
                    <td className="px-5 py-3 text-right">
                      {t.origem === "manual" && (
                        <button
                          type="button"
                          onClick={() => remover(t.id)}
                          aria-label="Excluir lançamento"
                          className="rounded-lg p-1.5 text-texto-suave transition hover:bg-alerta/10 hover:text-alerta"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
