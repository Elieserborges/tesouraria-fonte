import { NextResponse } from "next/server";
import { listarKanban } from "@/lib/dados";
import { SITE_HOST } from "@/lib/site";
import { obterSessao } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Escapa para CSV: aspas dobradas e o campo inteiro entre aspas. */
function campo(valor: unknown): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  return `"${texto.replace(/"/g, '""')}"`;
}

/** Vírgula decimal — é o que o Excel em português espera. */
const moeda = (v: number) => v.toFixed(2).replace(".", ",");

/** "2026-10-30" vira "30/10/2026". Sem data, fica vazio. */
function data(iso: string | null): string {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

/**
 * O quadro em planilha.
 *
 * Uma coluna "Etapa" em cada linha, e não uma aba por coluna: assim quem
 * recebe filtra, ordena e soma do jeito que precisar — que é justamente o
 * motivo de alguém pedir a planilha em vez do PDF.
 */
export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const { etapas, cartoes } = await listarKanban();

  const cabecalho = [
    "Etapa",
    "Posição",
    "Título",
    "Valor",
    "Responsável",
    "Criado em",
    "Prazo",
    "Categoria",
    "Motivo",
  ];

  // Na ordem do quadro: coluna por coluna, cartão por cartão. Quem confere
  // tem o arquivo na mesma sequência da tela.
  const linhas = etapas.flatMap((etapa) =>
    cartoes
      .filter((c) => c.etapa_id === etapa.id)
      .map((c, indice) =>
        [
          etapa.nome,
          indice + 1,
          c.titulo,
          c.valor === null ? "" : moeda(c.valor),
          c.responsavel ?? "",
          new Date(c.criado_em).toLocaleDateString("pt-BR"),
          data(c.prazo),
          c.categoria_nome ?? "",
          c.motivo ?? "",
        ]
          .map(campo)
          .join(";"),
      ),
  );

  /*
   * Duas linhas de procedência antes da tabela, como na planilha de
   * lançamentos: o arquivo circula por e-mail e, meses depois, ninguém lembra
   * de onde veio. A terceira linha é o aviso que separa este arquivo do
   * financeiro — aqui é compromisso, não dinheiro movimentado.
   */
  const procedencia = [
    campo(`Fluxx Finance — ${SITE_HOST}`),
    campo(`Quadro Kanban, exportado em ${new Date().toLocaleString("pt-BR")}`),
    campo(
      "Os valores são estimativas do que está em andamento. Não são " +
        "lançamentos e não entram no saldo.",
    ),
    "",
  ];

  // BOM para o Excel reconhecer os acentos; ponto e vírgula como separador.
  const csv =
    "﻿" + [...procedencia, cabecalho.map(campo).join(";"), ...linhas].join("\r\n");

  const hoje = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fluxx-kanban-${hoje}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
