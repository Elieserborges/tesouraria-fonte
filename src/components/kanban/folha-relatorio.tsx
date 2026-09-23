import { Logo } from "@/components/logo";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/format";
import { SITE_HOST } from "@/lib/site";
import type { KanbanCartao, KanbanEtapa } from "@/lib/types";

/**
 * O quadro em tabela, para a reunião.
 *
 * Aqui as colunas viram seções empilhadas, uma tabela cada, com o resumo por
 * etapa na frente: é a forma de quem vai ler sentado, conferindo linha por
 * linha. Para a parede existe a outra folha, que mantém as colunas.
 */
export function FolhaRelatorio({
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
  const totalCartoes = cartoes.length;

  const th =
    "px-3 py-2 text-left text-[11px] uppercase tracking-wide font-semibold text-texto-suave";
  const td = "px-3 py-1.5 align-top";

  return (
    <div className="mx-auto max-w-[210mm] space-y-6 text-texto">
      <header className="flex items-start justify-between gap-6 border-b-2 border-texto pb-4">
        <div>
          <Logo className="text-texto" />
          <p className="text-[10px] text-texto-suave">{SITE_HOST}</p>
          <p className="mt-3 text-lg font-semibold">Quadro Kanban</p>
          <p className="text-sm text-texto-suave">
            O que está em andamento — pedidos, cotações e compras antes de
            virarem lançamento.
          </p>
        </div>
        <div className="text-right text-xs text-texto-suave">
          <p className="font-medium text-texto">Comunidade Cristã Fonte da Vida</p>
          <p>CNPJ 07.913.258/0001-28</p>
          <p className="mt-2">Emitido em {formatarDataHora(new Date())}</p>
          {autor && <p>por {autor}</p>}
        </div>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
          Resumo por etapa
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda bg-superficie-2">
              <th className={th}>Etapa</th>
              <th className={`${th} text-right`}>Cartões</th>
              <th className={`${th} text-right`}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {colunas.map(({ etapa, cartoes: daEtapa, total }) => (
              <tr key={etapa.id} className="border-b border-borda/60">
                <td className={td}>{etapa.nome}</td>
                <td className={`${td} text-right tabular-nums`}>{daEtapa.length}</td>
                <td className={`${td} text-right font-medium tabular-nums`}>
                  {total > 0 ? formatarMoeda(total) : "—"}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-texto font-semibold">
              <td className={td}>Total</td>
              <td className={`${td} text-right tabular-nums`}>{totalCartoes}</td>
              <td className={`${td} text-right tabular-nums`}>
                {formatarMoeda(totalGeral)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {colunas.map(({ etapa, cartoes: daEtapa, total }) => (
        <section key={etapa.id} className="break-inside-avoid">
          <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide">
            <span>
              {etapa.nome}{" "}
              <span className="text-texto-suave">
                ({daEtapa.length} {daEtapa.length === 1 ? "cartão" : "cartões"})
              </span>
            </span>
            {total > 0 && (
              <span className="tabular-nums text-texto-suave">{formatarMoeda(total)}</span>
            )}
          </h2>

          {daEtapa.length === 0 ? (
            <p className="text-sm text-texto-suave">Nenhum cartão nesta etapa.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-borda bg-superficie-2">
                  <th className={th}>Cartão</th>
                  <th className={th}>Responsável</th>
                  <th className={th}>Criado em</th>
                  <th className={th}>Prazo</th>
                  <th className={th}>Categoria</th>
                  <th className={`${th} text-right`}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {daEtapa.map((cartao) => (
                  <tr key={cartao.id} className="border-b border-borda/60">
                    <td className={td}>
                      {cartao.titulo}
                      {cartao.motivo && (
                        <span className="block text-xs text-texto-suave">
                          {cartao.motivo}
                        </span>
                      )}
                    </td>
                    <td className={td}>{cartao.responsavel ?? "—"}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {formatarData(cartao.criado_em)}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {cartao.prazo ? formatarData(`${cartao.prazo}T12:00:00`) : "—"}
                    </td>
                    <td className={td}>{cartao.categoria_nome ?? "—"}</td>
                    <td className={`${td} whitespace-nowrap text-right font-medium tabular-nums`}>
                      {cartao.valor === null ? "—" : formatarMoeda(cartao.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      <footer className="border-t border-borda pt-4 text-[10px] text-texto-suave">
        {/*
          O aviso que separa este documento do relatório financeiro.

          Os dois saem com a mesma cara, e alguém que receba só este pode
          somar os valores achando que é dinheiro que já saiu da conta. Aqui
          nada disso virou lançamento: é o que se pretende gastar.
        */}
        <p>
          Os valores acima são estimativas do que está em andamento. Nenhum
          deles é lançamento: não entram no saldo nem nos relatórios
          financeiros. Valores em reais.
        </p>
        <p className="mt-1">
          O quadro atualizado fica em{" "}
          <span className="font-medium text-texto">{SITE_HOST}/kanban</span>.
        </p>
      </footer>
    </div>
  );
}
