const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const moedaCompacta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const mesLongo = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

export const formatarMoeda = (valor: number) => moeda.format(valor ?? 0);
export const formatarMoedaCompacta = (valor: number) =>
  moedaCompacta.format(valor ?? 0);
export const formatarData = (valor: string | Date) =>
  dataCurta.format(new Date(valor));
export const formatarDataHora = (valor: string | Date) =>
  dataHora.format(new Date(valor));
export const formatarMes = (valor: string | Date) =>
  mesLongo.format(new Date(valor));

export function formatarVariacao(atual: number, anterior: number): {
  texto: string;
  sinal: "positivo" | "negativo" | "neutro";
} {
  if (!anterior) {
    return { texto: atual ? "novo" : "—", sinal: "neutro" };
  }
  const variacao = ((atual - anterior) / Math.abs(anterior)) * 100;
  const sinal = variacao > 0.05 ? "positivo" : variacao < -0.05 ? "negativo" : "neutro";
  const prefixo = variacao > 0 ? "+" : "";
  return { texto: `${prefixo}${variacao.toFixed(1)}%`, sinal };
}

/** Primeiro instante do mês (horário local). */
export function inicioDoMes(referencia = new Date()): Date {
  return new Date(referencia.getFullYear(), referencia.getMonth(), 1, 0, 0, 0, 0);
}

/** Primeiro instante do mês seguinte. */
export function inicioDoMesSeguinte(referencia = new Date()): Date {
  return new Date(referencia.getFullYear(), referencia.getMonth() + 1, 1, 0, 0, 0, 0);
}

export function somarMeses(data: Date, meses: number): Date {
  return new Date(data.getFullYear(), data.getMonth() + meses, data.getDate());
}
