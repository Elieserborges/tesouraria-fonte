import Link from "next/link";
import { FileSpreadsheet, FileText, LayoutList } from "lucide-react";

type Opcao = {
  chave: string;
  titulo: string;
  descricao: string;
  detalhe: string;
  href: string;
  externo?: boolean;
  Icone: typeof FileText;
};

/**
 * Os três formatos que a tesouraria realmente usa: um documento para a
 * reunião, uma via curta para arquivo, e a planilha para quem quer
 * recalcular por conta própria.
 */
export function OpcoesExportacao({
  consulta,
  lancamentos,
}: {
  consulta: string;
  lancamentos: number;
}) {
  const opcoes: Opcao[] = [
    {
      chave: "completo",
      titulo: "Relatório completo",
      descricao:
        "Resumo, resultado por categoria, formas de pagamento, eventos, evolução e o anexo com cada lançamento.",
      detalhe: "PDF · para a reunião da Diretoria",
      href: `/exportar/imprimir?${consulta}`,
      externo: true,
      Icone: FileText,
    },
    {
      chave: "resumo",
      titulo: "Resumo executivo",
      descricao:
        "As mesmas tabelas, sem o anexo de lançamentos. Cabe em uma ou duas páginas.",
      detalhe: "PDF · para arquivo e envio rápido",
      href: `/exportar/imprimir?${consulta}&modelo=resumo`,
      externo: true,
      Icone: LayoutList,
    },
    {
      chave: "planilha",
      titulo: "Planilha de lançamentos",
      descricao: `Os ${lancamentos} lançamentos do período, com data, categoria, forma, pessoa e valor.`,
      detalhe: "CSV · abre no Excel e no Google Planilhas",
      href: `/api/exportar/transacoes?${consulta}`,
      Icone: FileSpreadsheet,
    },
  ];

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {opcoes.map((o) => (
        <article key={o.chave} className="cartao flex flex-col gap-3 p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-primaria/10 text-primaria">
            <o.Icone size={18} aria-hidden />
          </span>

          <div className="flex-1">
            <h2 className="text-sm font-semibold text-texto">{o.titulo}</h2>
            <p className="mt-1 text-sm text-texto-suave">{o.descricao}</p>
          </div>

          <p className="text-xs text-texto-suave">{o.detalhe}</p>

          <Link
            href={o.href}
            target={o.externo ? "_blank" : undefined}
            rel={o.externo ? "noopener" : undefined}
            prefetch={false}
            className="rounded-xl bg-primaria px-4 py-2.5 text-center text-sm font-semibold text-primaria-contraste transition hover:opacity-90"
          >
            {o.chave === "planilha" ? "Baixar planilha" : "Gerar PDF"}
          </Link>
        </article>
      ))}

      <p className="text-xs text-texto-suave lg:col-span-3">
        Os PDFs abrem em outra aba e a caixa de impressão aparece sozinha —
        escolha <strong className="text-texto">Salvar como PDF</strong> no destino.
        O documento sai sempre em tema claro, mesmo com o sistema no escuro, e os
        valores aparecem mesmo com o olhinho ligado.
      </p>
    </section>
  );
}
