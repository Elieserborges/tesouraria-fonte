import { Logo } from "@/components/logo";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/format";
import { SITE_HOST } from "@/lib/site";
import type { KanbanCartao, KanbanEtapa } from "@/lib/types";

/**
 * O quadro em papel, do jeito que ele é na tela.
 *
 * Este documento vai para a parede, não para a pasta: quem passa em frente ao
 * mural lê em três segundos, e é a forma das colunas que faz essa leitura —
 * uma tabela obrigaria a pessoa a parar e procurar em que etapa cada coisa
 * está. Por isso as colunas continuam lado a lado, e a folha é que vira de
 * lado para caber.
 */
export function FolhaMural({
  etapas,
  cartoes,
  autor,
}: {
  etapas: KanbanEtapa[];
  cartoes: KanbanCartao[];
  autor: string | null;
}) {

  const colunas = etapas.map((etapa) => {
    const daEtapa = cartoes.filter((c) => c.etapa_id === etapa.id);
    return {
      etapa,
      cartoes: daEtapa,
      total: daEtapa.reduce((soma, c) => soma + (c.valor ?? 0), 0),
    };
  });

  const totalGeral = colunas.reduce((soma, c) => soma + c.total, 0);

  return (
    <div className="mx-auto max-w-[297mm] space-y-4 text-texto">
      {/*
        A folha deitada.

        Quatro colunas em pé ficam com a largura de um dedo, e o título de
        cada cartão quebra em cinco linhas. Deitada, cada coluna tem espaço
        para um cartão legível de longe.
      */}
      <style
        dangerouslySetInnerHTML={{
          __html: "@media print { @page { size: A4 landscape; margin: 10mm; } }",
        }}
      />

      <header className="flex items-end justify-between gap-6 border-b-2 border-texto pb-3">
        <div>
          <Logo className="text-texto" />
          <p className="mt-2 text-base font-semibold leading-tight">Quadro Kanban</p>
          <p className="text-xs text-texto-suave">
            Comunidade Cristã Fonte da Vida · {cartoes.length}{" "}
            {cartoes.length === 1 ? "cartão" : "cartões"}
            {totalGeral > 0 && ` · ${formatarMoeda(totalGeral)} em andamento`}
          </p>
        </div>
        <div className="text-right text-[10px] text-texto-suave">
          <p>{formatarDataHora(new Date())}</p>
          {autor && <p>por {autor}</p>}
          <p>{SITE_HOST}</p>
        </div>
      </header>

      <div
        className="grid items-start gap-3"
        style={{
          gridTemplateColumns: `repeat(${Math.max(colunas.length, 1)}, minmax(0, 1fr))`,
        }}
      >
        {colunas.map(({ etapa, cartoes: daEtapa, total }) => (
          <section
            key={etapa.id}
            className="break-inside-avoid overflow-hidden rounded-xl border border-borda bg-superficie-2"
          >
            <header className="flex items-center gap-1.5 border-b border-borda px-2 py-1.5">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: etapa.cor }}
              />
              <h2 className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wide">
                {etapa.nome}
              </h2>
              <span className="shrink-0 text-[10px] tabular-nums text-texto-suave">
                {daEtapa.length}
              </span>
            </header>

            {total > 0 && (
              <p className="px-2 pt-1.5 text-[10px] font-medium tabular-nums text-texto-suave">
                {formatarMoeda(total)}
              </p>
            )}

            <div className="space-y-2 p-2">
              {daEtapa.length === 0 && (
                <p className="py-6 text-center text-[9px] uppercase tracking-wide text-texto-suave">
                  vazio
                </p>
              )}

              {daEtapa.map((cartao) => (
                <article
                  key={cartao.id}
                  className="break-inside-avoid rounded-lg border border-borda bg-superficie p-2"
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="min-w-0 flex-1 text-[11px] font-semibold leading-snug">
                      {cartao.titulo}
                    </p>
                    {cartao.valor !== null && (
                      <span className="shrink-0 text-[11px] font-semibold tabular-nums">
                        {formatarMoeda(cartao.valor)}
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 text-[10px] text-texto-suave">
                    {cartao.responsavel ?? "sem responsável"}
                    {cartao.prazo &&
                      ` · prazo ${formatarData(`${cartao.prazo}T12:00:00`)}`}
                  </p>

                  {/*
                    No mural o motivo aparece: é ele que responde a pergunta de
                    quem passa e não acompanhou a conversa. Na tela ele fica
                    recolhido porque lá a coluna é estreita e se rola muito.
                  */}
                  {cartao.motivo && (
                    <p className="mt-1 text-[9px] leading-snug text-texto-suave">
                      {cartao.motivo}
                    </p>
                  )}

                  <p className="mt-1 flex items-center justify-between gap-1 text-[9px] text-texto-suave">
                    <span>{formatarData(cartao.criado_em)}</span>
                    {cartao.categoria_nome && (
                      <span className="truncate rounded-full bg-superficie-2 px-1.5 py-0.5">
                        {cartao.categoria_nome}
                      </span>
                    )}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="border-t border-borda pt-2 text-[9px] text-texto-suave">
        {/*
          O aviso que separa este papel do relatório financeiro: pregado no
          mural, ele some do contexto, e alguém pode somar os valores achando
          que é dinheiro que já saiu da conta.
        */}
        <p>
          Valores previstos do que está em andamento — nada aqui é lançamento,
          não entra no saldo nem nos relatórios financeiros. Quadro atualizado
          em {SITE_HOST}/kanban.
        </p>
      </footer>
    </div>
  );
}
