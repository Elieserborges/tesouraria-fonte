import { NextResponse, type NextRequest } from "next/server";
import { listarTransacoes } from "@/lib/dados";
import { janelaDaUrl } from "@/lib/periodo";
import { recorteDaUrl, rotuloDoRecorte } from "@/lib/exportacao";
import { SITE_HOST } from "@/lib/site";
import { obterSessao } from "@/lib/supabase/server";
import { FORMA_LABEL, type FormaPagamento } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Escapa para CSV: aspas dobradas e o campo inteiro entre aspas. */
function campo(valor: unknown): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  return `"${texto.replace(/"/g, '""')}"`;
}

/** Vírgula decimal — é o que o Excel em português espera. */
const moeda = (v: number) => v.toFixed(2).replace(".", ",");

export async function GET(request: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const { inicio, fim, de, ate, tudo } = janelaDaUrl(sp);

  const recorte = recorteDaUrl(sp);

  // Leva tudo, cofrinho incluído: a coluna Conta separa o que é caixa do que
  // é reserva, e quem confere prefere o arquivo completo.
  const todas = await listarTransacoes({
    inicio,
    fim,
    limite: 50000,
    reservas: "todas",
  });

  // Mesmo recorte do relatório impresso: quem exporta as contas de um evento
  // quer a planilha do evento, não a da igreja com uma coluna a mais.
  const transacoes =
    recorte.categorias.length > 0
      ? todas.filter((t) => t.categoria && recorte.categorias.includes(t.categoria.nome))
      : todas;

  const cabecalho = [
    "Data", "Hora", "Tipo", "Valor", "Status", "Conta", "Categoria",
    "Forma", "Descrição", "Pessoa", "Origem", "ID Mercado Pago",
  ];

  const linhas = transacoes.map((t) => {
    const d = new Date(t.ocorrido_em);
    return [
      d.toLocaleDateString("pt-BR"),
      d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      t.tipo === "entrada" ? "Entrada" : "Saída",
      moeda(t.valor),
      t.status,
      t.conta?.nome ?? "",
      t.categoria?.nome ?? "Sem categoria",
      t.forma ? (FORMA_LABEL[t.forma as FormaPagamento] ?? t.forma) : "",
      t.descricao ?? "",
      t.contraparte ?? "",
      t.origem,
      t.mp_payment_id ?? "",
    ].map(campo).join(";");
  });

  /*
   * Duas linhas de procedência antes da tabela.
   *
   * Uma planilha exportada circula por e-mail e some do contexto: seis meses
   * depois ninguém lembra de onde veio nem que período cobre. O Excel abre
   * normalmente com elas no topo, e quem for conferir sabe onde procurar a
   * origem.
   */
  const periodo = tudo ? "todo o período" : `de ${de} a ${ate}`;
  const procedencia = [
    campo(`Fluxx Finance — ${SITE_HOST}`),
    campo(
      (rotuloDoRecorte(recorte.categorias) ?? "Todas as categorias") +
        ` — ${periodo}, exportadas em ${new Date().toLocaleString("pt-BR")}`,
    ),
    "",
  ];

  // BOM para o Excel reconhecer os acentos; ponto e vírgula como separador.
  const csv =
    "﻿" + [...procedencia, cabecalho.map(campo).join(";"), ...linhas].join("\r\n");
  const nome = tudo ? "todo-o-periodo" : `${de}_a_${ate}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fluxx-transacoes-${nome}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
