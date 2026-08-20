import { criarClienteServidor } from "@/lib/supabase/server";
import { ehTransferencia } from "@/lib/types";
import type {
  Categoria,
  Conta,
  EventoComResultado,
  RegraComUso,
  TipoTransacao,
  TransacaoComRelacoes,
} from "@/lib/types";

const SELECT_TRANSACAO =
  "id, conta_id, categoria_id, tipo, valor, descricao, contraparte, metodo, status, ocorrido_em, origem, mp_payment_id, observacao, categoria_automatica, forma, criado_em, conta:contas(id, nome, cor), categoria:categorias(id, nome, cor, eh_transferencia)";

export type SaldoConta = {
  conta_id: string;
  conta_nome: string;
  conta_cor: string;
  entradas: number;
  saidas: number;
  saldo: number;
};

export type FiltroTransacoes = {
  inicio?: Date;
  fim?: Date;
  contaId?: string;
  categoriaId?: string;
  tipo?: TipoTransacao;
  forma?: string;
  busca?: string;
  limite?: number;
};

export async function listarContas(): Promise<Conta[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("contas")
    .select("id, slug, nome, descricao, mp_user_id, cor, ativa")
    .eq("ativa", true)
    .order("nome");
  return (data as Conta[]) ?? [];
}

export async function listarCategorias(): Promise<Categoria[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("categorias")
    .select("id, nome, tipo, cor, eh_transferencia")
    .order("tipo")
    .order("nome");
  return (data as Categoria[]) ?? [];
}

export async function listarSaldosPorConta(): Promise<SaldoConta[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("saldo_por_conta")
    .select("conta_id, conta_nome, conta_cor, entradas, saidas, saldo")
    .order("conta_nome");
  return ((data ?? []) as SaldoConta[]).map((linha) => ({
    ...linha,
    entradas: Number(linha.entradas),
    saidas: Number(linha.saidas),
    saldo: Number(linha.saldo),
  }));
}

/**
 * O Supabase devolve no máximo 1000 linhas por requisição, mesmo pedindo
 * mais. Pedir `.limit(10000)` não dá erro — simplesmente vem cortado.
 * Foi assim que os relatórios de Ano e Tudo passaram a somar só parte das
 * transações e mostrar um resultado errado, sem aviso nenhum.
 */
const MAX_POR_REQUISICAO = 1000;

export async function listarTransacoes(
  filtro: FiltroTransacoes = {},
): Promise<TransacaoComRelacoes[]> {
  const supabase = await criarClienteServidor();
  const teto = filtro.limite ?? 500;

  const montarConsulta = () => {
    let consulta = supabase
      .from("transacoes")
      .select(SELECT_TRANSACAO)
      .order("ocorrido_em", { ascending: false });

    if (filtro.inicio) consulta = consulta.gte("ocorrido_em", filtro.inicio.toISOString());
    if (filtro.fim) consulta = consulta.lt("ocorrido_em", filtro.fim.toISOString());
    if (filtro.contaId) consulta = consulta.eq("conta_id", filtro.contaId);
    if (filtro.categoriaId === "sem-categoria") {
      consulta = consulta.is("categoria_id", null);
    } else if (filtro.categoriaId) {
      consulta = consulta.eq("categoria_id", filtro.categoriaId);
    }
    if (filtro.tipo) consulta = consulta.eq("tipo", filtro.tipo);
    if (filtro.forma) consulta = consulta.eq("forma", filtro.forma);
    if (filtro.busca) {
      const termo = `%${filtro.busca}%`;
      consulta = consulta.or(`descricao.ilike.${termo},contraparte.ilike.${termo}`);
    }
    return consulta;
  };

  const linhas: TransacaoComRelacoes[] = [];

  for (let de = 0; de < teto; de += MAX_POR_REQUISICAO) {
    const ate = Math.min(de + MAX_POR_REQUISICAO, teto) - 1;
    const { data, error } = await montarConsulta().range(de, ate);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    linhas.push(...(data as unknown as TransacaoComRelacoes[]));
    if (data.length < ate - de + 1) break; // última página
  }

  return linhas.map((t) => ({ ...t, valor: Number(t.valor) }));
}

/** Regras de categorização, com quantas transações cada uma alcança hoje. */
export async function listarRegras(): Promise<RegraComUso[]> {
  const supabase = await criarClienteServidor();

  const { data: regras } = await supabase
    .from("regras_categoria")
    .select("id, padrao, modo, campo, tipo, categoria_id, criado_em, categoria:categorias(id, nome, cor, eh_transferencia)")
    .order("criado_em", { ascending: false });

  if (!regras?.length) return [];

  // Conta as transações que casam com o padrão da regra (não as da categoria
  // inteira). São poucas regras, então uma consulta por regra é aceitável.
  return Promise.all(
    (regras as unknown as RegraComUso[]).map(async (r) => {
      let consulta = supabase
        .from("transacoes")
        .select("id", { count: "exact", head: true })
        .eq("tipo", r.tipo);

      const coluna = r.campo === "contraparte" ? "contraparte" : "descricao";
      consulta =
        r.modo === "contem"
          ? consulta.ilike(coluna, `%${r.padrao}%`)
          : // ilike sem curinga = igualdade sem diferenciar maiúsculas
            consulta.ilike(coluna, r.padrao);

      const { count } = await consulta;
      return { ...r, atingidas: count ?? 0 };
    }),
  );
}

/** Edições cadastradas, com arrecadação e despesa de cada uma. */
export async function listarEventos(): Promise<EventoComResultado[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("resultado_por_evento")
    .select("evento_id, nome, categoria_nome, inicio, fim, observacao, entradas, saidas, resultado, lancamentos")
    .order("inicio", { ascending: false });

  return ((data ?? []) as EventoComResultado[]).map((e) => ({
    ...e,
    entradas: Number(e.entradas),
    saidas: Number(e.saidas),
    resultado: Number(e.resultado),
    lancamentos: Number(e.lancamentos),
  }));
}

export async function contarSemCategoria(): Promise<number> {
  const supabase = await criarClienteServidor();
  const { count } = await supabase
    .from("transacoes")
    .select("id", { count: "exact", head: true })
    .is("categoria_id", null);
  return count ?? 0;
}

// ------------------------------------------------------------------
// Agregações (feitas em memória — o volume da tesouraria comporta)
// ------------------------------------------------------------------

/**
 * Total de entradas ou saídas do período.
 * Transferências entre contas da igreja ficam de fora: elas mexem no saldo
 * de cada conta, mas não são receita nem despesa.
 */
export function somar(transacoes: TransacaoComRelacoes[], tipo: TipoTransacao) {
  return transacoes
    .filter(
      (t) => t.tipo === tipo && t.status === "approved" && !ehTransferencia(t),
    )
    .reduce((total, t) => total + t.valor, 0);
}

/** Total movimentado em transferências entre contas, no período. */
export function somarTransferencias(
  transacoes: TransacaoComRelacoes[],
  tipo: TipoTransacao,
) {
  return transacoes
    .filter((t) => t.tipo === tipo && t.status === "approved" && ehTransferencia(t))
    .reduce((total, t) => total + t.valor, 0);
}

export type PontoFluxo = { dia: string; rotulo: string; entradas: number; saidas: number };

/** Chave AAAA-MM-DD no fuso local (evita o deslocamento do toISOString). */
function chaveLocal(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Acima disso o gráfico vira mensal: 100 barras diárias não se leem. */
const DIAS_PARA_AGRUPAR_POR_MES = 92;

const MES_ABREVIADO = new Intl.DateTimeFormat("pt-BR", { month: "short" });

/** "nov/25" — mais curto que "nov. de 25" e cabe no eixo do gráfico. */
function rotuloMes(d: Date): string {
  const mes = MES_ABREVIADO.format(d).replace(".", "");
  return `${mes}/${String(d.getFullYear()).slice(2)}`;
}

/**
 * Série de entradas x saídas no intervalo [inicio, fim).
 *
 * Escolhe a granularidade pelo tamanho do período: até três meses mostra
 * dia a dia; acima disso agrupa por mês, senão o eixo vira um borrão.
 */
export function fluxoDoPeriodo(
  transacoes: TransacaoComRelacoes[],
  inicio: Date,
  fim: Date,
): PontoFluxo[] {
  const dias = Math.ceil((fim.getTime() - inicio.getTime()) / 86400000);
  const porMes = dias > DIAS_PARA_AGRUPAR_POR_MES;

  const chave = (d: Date) => (porMes ? chaveLocal(d).slice(0, 7) : chaveLocal(d));
  const pontos = new Map<string, PontoFluxo>();

  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  while (cursor < fim) {
    const k = chave(cursor);
    if (!pontos.has(k)) {
      pontos.set(k, {
        dia: k,
        rotulo: porMes ? rotuloMes(cursor) : String(cursor.getDate()).padStart(2, "0"),
        entradas: 0,
        saidas: 0,
      });
    }
    if (porMes) cursor.setMonth(cursor.getMonth() + 1, 1);
    else cursor.setDate(cursor.getDate() + 1);
  }

  for (const t of transacoes) {
    if (t.status !== "approved" || ehTransferencia(t)) continue;
    const ponto = pontos.get(chave(new Date(t.ocorrido_em)));
    if (!ponto) continue;
    if (t.tipo === "entrada") ponto.entradas += t.valor;
    else ponto.saidas += t.valor;
  }

  return [...pontos.values()];
}

export type ResumoCategoria = {
  nome: string;
  cor: string;
  entradas: number;
  saidas: number;
  resultado: number;
  lancamentos: number;
};

/**
 * Entradas x saídas por categoria, agrupadas pelo NOME.
 *
 * O agrupamento é por nome porque cada categoria existe separada para
 * entrada e para saída. Um evento como "Face a Face" arrecada por uma e
 * gasta pela outra — juntar pelo nome é o que mostra se ele se pagou.
 *
 * Transferências entre contas ficam de fora: não são receita nem despesa.
 */
export function resumoPorCategoria(
  transacoes: TransacaoComRelacoes[],
): ResumoCategoria[] {
  const mapa = new Map<string, ResumoCategoria>();

  for (const t of transacoes) {
    if (t.status !== "approved" || ehTransferencia(t)) continue;

    const nome = t.categoria?.nome ?? "Sem categoria";
    const atual =
      mapa.get(nome) ??
      {
        nome,
        cor: t.categoria?.cor ?? "#94A3B8",
        entradas: 0,
        saidas: 0,
        resultado: 0,
        lancamentos: 0,
      };

    if (t.tipo === "entrada") atual.entradas += t.valor;
    else atual.saidas += t.valor;
    atual.resultado = atual.entradas - atual.saidas;
    atual.lancamentos += 1;

    mapa.set(nome, atual);
  }

  return [...mapa.values()].sort(
    (a, b) => b.entradas + b.saidas - (a.entradas + a.saidas),
  );
}

export type FatiaCategoria = { nome: string; cor: string; valor: number };

export function porCategoria(
  transacoes: TransacaoComRelacoes[],
  tipo: TipoTransacao,
): FatiaCategoria[] {
  const mapa = new Map<string, FatiaCategoria>();

  for (const t of transacoes) {
    if (t.tipo !== tipo || t.status !== "approved" || ehTransferencia(t)) continue;
    const nome = t.categoria?.nome ?? "Sem categoria";
    const cor = t.categoria?.cor ?? "#94A3B8";
    const atual = mapa.get(nome) ?? { nome, cor, valor: 0 };
    atual.valor += t.valor;
    mapa.set(nome, atual);
  }

  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}
