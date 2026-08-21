/*
 * O "Extrato de conta" que se baixa no painel do Mercado Pago.
 *
 * É o único lugar onde o nome de quem pagou por Pix aparece por extenso. A API
 * mascara ("XXXXXXXXXXX") e nem o relatório automático traz — a coluna
 * PAYER_NAME existe e vem vazia. Por isso este arquivo continua tendo um
 * papel, mesmo com a conciliação já automática.
 *
 * Formato:
 *
 *   INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE
 *   575,94;19.322,10;-19.128,95;769,09
 *
 *   RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE
 *   01-08-2026;Pix recebido Fulano de Tal;171776200626;5.909,40;6.301,68
 */

export type MovimentoDoExtrato = {
  /** REFERENCE_ID — casa com `mp_payment_id`. */
  id: string;
  ocorridoEm: string;
  dia: string;
  descricao: string;
  /** Já líquido. Positivo entrou, negativo saiu. */
  liquido: number;
  saldo: number;
  /** Quem pagou, quando a descrição revela. */
  nome: string | null;
};

export type ExtratoLido = {
  inicial: number;
  final: number;
  de: string;
  ate: string;
  movimentos: MovimentoDoExtrato[];
};

/*
 * As descrições que carregam um nome.
 *
 * "Pagamento Loja das balas" também casaria com um padrão solto, mas ali o
 * texto é o estabelecimento, não a pessoa — por isso só estas três formas,
 * que são as de dinheiro entrando de alguém.
 */
const COM_NOME =
  /^(?:Pix recebido|Transferência Pix recebida|Pagamento com Código QR Pix)\s+(.+)$/i;

function paraNumero(texto: string | undefined): number {
  if (!texto) return 0;
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : 0;
}

export function lerExtratoDeConta(conteudo: string): ExtratoLido {
  const linhas = conteudo.replace(/^﻿/, "").split(/\r?\n/);

  const cabecalho = linhas.findIndex((l) => l.startsWith("RELEASE_DATE"));
  if (cabecalho < 0) {
    throw new Error(
      "Não parece um extrato de conta do Mercado Pago: não achei a linha RELEASE_DATE.",
    );
  }

  const totais = (linhas[1] ?? "").split(";").map(paraNumero);
  const movimentos: MovimentoDoExtrato[] = [];

  for (const linha of linhas.slice(cabecalho + 1)) {
    const c = linha.split(";");
    if (c.length < 5 || !c[2] || !c[2].trim()) continue;

    const [dia, mes, ano] = c[0].trim().split("-");
    if (!ano) continue;

    const descricao = c[1].trim();
    const achado = descricao.match(COM_NOME);

    movimentos.push({
      id: c[2].trim(),
      // Meio-dia evita que o fuso empurre o lançamento para o dia anterior.
      ocorridoEm: new Date(`${ano}-${mes}-${dia}T12:00:00-03:00`).toISOString(),
      dia: `${ano}-${mes}-${dia}`,
      descricao,
      liquido: paraNumero(c[3]),
      saldo: paraNumero(c[4]),
      nome: achado ? achado[1].trim() : null,
    });
  }

  if (movimentos.length === 0) {
    throw new Error("O arquivo não tem nenhum movimento.");
  }

  return {
    inicial: totais[0] ?? 0,
    final: totais[3] ?? 0,
    de: movimentos[0].dia,
    ate: movimentos[movimentos.length - 1].dia,
    movimentos,
  };
}
