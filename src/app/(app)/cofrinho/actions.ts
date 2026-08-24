"use server";

import { revalidatePath } from "next/cache";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterSessao } from "@/lib/supabase/server";
import { podeEditar, STATUS_NO_SALDO } from "@/lib/types";

export type ResultadoAcerto = {
  erro?: string;
  ajuste?: number;
  rendimentoTotal?: number;
  saldo?: number;
};

/**
 * Acerta o rendimento do cofrinho pelo saldo que o aplicativo mostra.
 *
 * O rendimento é o único dinheiro da igreja que nenhuma fonte automática
 * reporta: ele nasce dentro do cofrinho e nunca passa pela conta corrente,
 * então não aparece em pagamento, em extrato nem no relatório. As entradas e
 * saídas do cofrinho, essas sim, chegam sozinhas.
 *
 * O caminho possível é o inverso: as movimentações são conhecidas ao centavo,
 * então o rendimento é o que falta para chegar no saldo do aplicativo.
 *
 * O rótulo "rendeu R$ X nos últimos N meses" não serve — é uma janela móvel,
 * não o acumulado. Foi confiar nele que deixou R$ 0,22 de diferença.
 */
export async function acertarRendimento(
  _anterior: ResultadoAcerto,
  form: FormData,
): Promise<ResultadoAcerto> {
  const sessao = await obterSessao();
  if (!sessao) return { erro: "Sessão expirada." };
  if (!podeEditar(sessao.perfil?.papel)) {
    return { erro: "Seu perfil tem acesso apenas de leitura." };
  }

  const informado = String(form.get("saldo") ?? "").trim();
  if (!informado) return { erro: "Informe o saldo que aparece no aplicativo." };

  const alvo = Number(
    informado.replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", "."),
  );
  if (!Number.isFinite(alvo) || alvo < 0) {
    return { erro: `Não entendi "${informado}" como um valor.` };
  }

  const admin = criarClienteAdmin();

  const { data: conta } = await admin
    .from("contas")
    .select("id")
    .eq("slug", "cofrinho")
    .single();

  if (!conta) return { erro: "A conta do cofrinho não está cadastrada." };

  const linhas: { id: string; valor: number; tipo: string; mp_payment_id: string | null }[] = [];
  for (let de = 0; ; de += 1000) {
    const { data } = await admin
      .from("transacoes")
      .select("id, valor, tipo, mp_payment_id")
      .eq("conta_id", conta.id)
      .in("status", [...STATUS_NO_SALDO])
      .order("ocorrido_em", { ascending: true })
      .range(de, de + 999);
    if (!data || data.length === 0) break;
    linhas.push(...(data as typeof linhas));
    if (data.length < 1000) break;
  }

  const ehRendimento = (l: { mp_payment_id: string | null }) =>
    String(l.mp_payment_id ?? "").startsWith("rendimento-cofrinho");

  const guardado = linhas
    .filter((l) => !ehRendimento(l))
    .reduce((s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)), 0);

  const rendimentos = linhas.filter(ehRendimento);
  const rendimentoAtual = rendimentos.reduce((s, l) => s + Number(l.valor), 0);
  const correto = Number((alvo - guardado).toFixed(2));
  const ajuste = Number((correto - rendimentoAtual).toFixed(2));

  if (correto < 0) {
    return {
      erro:
        "Esse saldo é menor do que o que já foi guardado. Confira o valor — " +
        "um resgate recente pode ainda não ter chegado aqui.",
    };
  }

  if (Math.abs(ajuste) < 0.005) {
    return { ajuste: 0, rendimentoTotal: rendimentoAtual, saldo: alvo };
  }

  // O ajuste vai no lançamento mais recente: é lá que a diferença nasceu, e
  // mexer nos meses antigos mudaria relatórios que já foram apresentados.
  const ultimo = rendimentos[rendimentos.length - 1];

  if (ultimo) {
    const novo = Number((Number(ultimo.valor) + ajuste).toFixed(2));
    if (novo < 0) {
      return { erro: "O ajuste deixaria o rendimento do mês negativo. Confira o valor." };
    }
    await admin
      .from("transacoes")
      .update({ valor: novo, valor_bruto: novo })
      .eq("id", ultimo.id);
  } else {
    const mes = new Date().toISOString().slice(0, 7);
    await admin.from("transacoes").insert({
      conta_id: conta.id,
      tipo: "entrada",
      valor: correto,
      valor_bruto: correto,
      tarifa: 0,
      descricao: "Rendimento do cofrinho",
      observacao: "Rendeu dentro do cofrinho, sem passar pela conta corrente.",
      status: "approved",
      ocorrido_em: new Date().toISOString(),
      origem: "mercadopago",
      mp_payment_id: `rendimento-cofrinho-${mes}`,
    });
  }

  revalidatePath("/cofrinho");
  revalidatePath("/dashboard");
  revalidatePath("/relatorios");

  return { ajuste, rendimentoTotal: correto, saldo: alvo };
}
