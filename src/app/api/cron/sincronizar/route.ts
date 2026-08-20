import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  buscarPagamento,
  buscarPagamentosNaJanela,
  credenciais,
  paraTransacao,
} from "@/lib/mercadopago";
import {
  importarRelatoriosProntos,
  pedirProximoRelatorio,
  revisitarPendentes,
} from "@/lib/extrato-sincronizacao";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Quantas horas para trás varrer. Cobre folgado o intervalo entre execuções. */
const JANELA_HORAS = 24;

type ContaSincronizavel = {
  id: string;
  slug: string;
  nome: string;
  mp_user_id: string | null;
};

/**
 * Sincronização agendada com o Mercado Pago.
 *
 * O webhook só recebe pagamentos que passam pela aplicação; um Pix feito
 * direto para a chave da conta nunca notifica. Esta rotina busca pela API
 * e cobre esse caso — os dois convivem sem duplicar, porque a gravação é
 * `upsert` por mp_payment_id.
 *
 * Disparada pelo Vercel Cron (ver vercel.json), que envia o CRON_SECRET no
 * cabeçalho Authorization.
 */
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!segredo) {
    return NextResponse.json({ erro: "CRON_SECRET não configurado" }, { status: 500 });
  }
  if (autorizacao !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const admin = criarClienteAdmin();
  const ate = new Date();
  const de = new Date(ate.getTime() - JANELA_HORAS * 3600 * 1000);

  const { data: contas } = await admin
    .from("contas")
    .select("id, slug, nome, mp_user_id")
    .eq("ativa", true);

  const resultado: Record<string, unknown>[] = [];

  for (const conta of (contas ?? []) as ContaSincronizavel[]) {
    const { accessToken } = credenciais(conta.slug);
    if (!accessToken) continue; // conta sem credencial do Mercado Pago

    try {
      const pagamentos = await buscarPagamentosNaJanela(accessToken, de, ate);

      if (pagamentos.length > 0) {
        const linhas = pagamentos.map((p) => paraTransacao(conta, p));
        const { error } = await admin
          .from("transacoes")
          .upsert(linhas, { onConflict: "mp_payment_id" });

        if (error) throw new Error(error.message);
      }

      // O extrato fecha o que a API de pagamentos não mostra (saque, Pix
      // enviado, cofrinho) e corrige o bruto para o líquido. O relatório
      // demora minutos: esta execução importa o que ficou pronto e deixa a
      // próxima janela pedida para a execução seguinte.
      // Pagamentos que ainda podem mudar de status ficariam congelados,
      // porque a varredura acima só olha as últimas 24 horas.
      const pendentes = await revisitarPendentes(
        admin, conta, accessToken, buscarPagamento, paraTransacao,
      );

      const extrato = await importarRelatoriosProntos(admin, conta, accessToken);
      const pediu = await pedirProximoRelatorio(admin, conta, accessToken);

      resultado.push({
        conta: conta.slug,
        encontrados: pagamentos.length,
        pendentes,
        extrato: { ...extrato, pedidoNovo: pediu },
      });
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "erro desconhecido";
      await admin.from("webhook_eventos").insert({
        conta_slug: conta.slug,
        tipo: "cron",
        status: "erro",
        detalhe: mensagem,
      });
      resultado.push({ conta: conta.slug, erro: mensagem });
    }
  }

  // Nome de quem pagou vem mascarado na API; o cadastro de pagadores
  // preenche a partir do que os extratos ja ensinaram.
  const { data: nomeados } = await admin.rpc("aplicar_nomes_pagadores");

  // Classifica o que casar com as regras já cadastradas.
  const { data: classificadas } = await admin.rpc("aplicar_regras_categoria");

  return NextResponse.json({
    ok: true,
    janela: { de: de.toISOString(), ate: ate.toISOString() },
    contas: resultado,
    nomeados: Number(nomeados ?? 0),
    classificadas: Number(classificadas ?? 0),
  });
}
