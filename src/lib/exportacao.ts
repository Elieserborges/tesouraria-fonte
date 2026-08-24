/*
 * O que entra numa exportação personalizada.
 *
 * Serve a um caso concreto: entregar ao diretor do Face a Face as contas do
 * evento dele, sem as demais movimentações da igreja. Filtrar por categoria
 * resolve metade; a outra metade é escolher quais blocos do documento fazem
 * sentido para quem vai receber.
 *
 * Os parâmetros viajam pela URL para que o PDF e o CSV leiam a mesma coisa, e
 * para que um recorte possa ser salvo como link.
 */

export const SECOES = [
  "resumo",
  "categorias",
  "cofrinho",
  "formas",
  "eventos",
  "evolucao",
  "anexo",
] as const;

export type Secao = (typeof SECOES)[number];

/*
 * O rótulo de cada bloco do documento.
 *
 * "Eventos" seria o nome natural do bloco das edições, mas existe uma
 * categoria com esse nome — e as duas listas aparecem lado a lado na mesma
 * tela. A mesma palavra significando duas coisas diferentes a um palmo de
 * distância confunde, então o bloco diz o que mostra.
 */
export const SECAO_LABEL: Record<Secao, string> = {
  resumo: "Resumo do período",
  categorias: "Totais por categoria",
  cofrinho: "Cofrinho",
  formas: "Formas de pagamento",
  eventos: "Edições e seus resultados",
  evolucao: "Evolução no tempo",
  anexo: "Lista dos lançamentos",
};

export type Recorte = {
  /** Nomes de categoria. Vazio significa todas. */
  categorias: string[];
  secoes: Secao[];
};

/**
 * Lê o recorte da URL.
 *
 * Sem parâmetro nenhum, devolve tudo — é o relatório completo de sempre, e
 * quem nunca abriu a personalização não deve notar diferença.
 */
export function recorteDaUrl(sp: Record<string, string | string[] | undefined>): Recorte {
  const texto = (chave: string) => {
    const v = sp[chave];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };

  const categorias = (texto("cats") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const pedidas = (texto("secoes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Secao => (SECOES as readonly string[]).includes(s));

  return {
    categorias,
    secoes: pedidas.length > 0 ? pedidas : [...SECOES],
  };
}

/** Monta a parte da URL que descreve o recorte. */
export function recorteParaUrl(recorte: Recorte): string {
  const partes: string[] = [];

  if (recorte.categorias.length > 0) {
    partes.push(`cats=${encodeURIComponent(recorte.categorias.join(","))}`);
  }
  // Só vai na URL quando é um recorte mesmo: com tudo marcado, o link fica
  // limpo e continua sendo o relatório completo.
  if (recorte.secoes.length !== SECOES.length) {
    partes.push(`secoes=${recorte.secoes.join(",")}`);
  }

  return partes.join("&");
}

/**
 * O título do recorte, para o documento dizer do que trata.
 *
 * Um relatório entregue a alguém precisa deixar claro que é parcial, senão
 * quem recebe pode ler os totais como se fossem os da igreja inteira.
 */
export function rotuloDoRecorte(categorias: string[]): string | null {
  if (categorias.length === 0) return null;
  if (categorias.length <= 3) return categorias.join(", ");
  return `${categorias.slice(0, 2).join(", ")} e mais ${categorias.length - 2}`;
}
