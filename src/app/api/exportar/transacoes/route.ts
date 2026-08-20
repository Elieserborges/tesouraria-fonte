import { NextResponse, type NextRequest } from "next/server";
import { listarTransacoes } from "@/lib/dados";
import { janelaDaUrl } from "@/lib/periodo";
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

  // A exportação leva tudo, cofrinho incluído: a coluna Conta separa o que é
  // caixa do que é reserva, e quem confere prefere o arquivo completo.
  const transacoes = await listarTransacoes({
    inicio,
    fim,
    limite: 50000,
    reservas: "todas",
  });

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

  // BOM para o Excel reconhecer os acentos; ponto e vírgula como separador.
  const csv = "﻿" + [cabecalho.map(campo).join(";"), ...linhas].join("\r\n");
  const nome = tudo ? "todo-o-periodo" : `${de}_a_${ate}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fluxx-transacoes-${nome}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
