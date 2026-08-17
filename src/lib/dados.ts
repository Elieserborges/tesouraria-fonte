import { criarClienteServidor } from "@/lib/supabase/server";
import type {
  Categoria,
  Conta,
  TipoTransacao,
  TransacaoComRelacoes,
} from "@/lib/types";

const SELECT_TRANSACAO =
  "id, conta_id, categoria_id, tipo, valor, descricao, contraparte, metodo, status, ocorrido_em, origem, mp_payment_id, observacao, criado_em, conta:contas(id, nome, cor), categoria:categorias(id, nome, cor)";

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
    .select("id, nome, tipo, cor")
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

export async function listarTransacoes(
  filtro: FiltroTransacoes = {},
): Promise<TransacaoComRelacoes[]> {
  const supabase = await criarClienteServidor();

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
  if (filtro.busca) {
    const termo = `%${filtro.busca}%`;
    consulta = consulta.or(`descricao.ilike.${termo},contraparte.ilike.${termo}`);
  }
  consulta = consulta.limit(filtro.limite ?? 500);

  const { data, error } = await consulta;
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as TransacaoComRelacoes[]).map((t) => ({
    ...t,
    valor: Number(t.valor),
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

export function somar(transacoes: TransacaoComRelacoes[], tipo: TipoTransacao) {
  return transacoes
    .filter((t) => t.tipo === tipo && t.status === "approved")
    .reduce((total, t) => total + t.valor, 0);
}

export type PontoFluxo = { dia: string; rotulo: string; entradas: number; saidas: number };

/** Chave AAAA-MM-DD no fuso local (evita o deslocamento do toISOString). */
function chaveLocal(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Série diária de entradas x saídas dentro do intervalo [inicio, fim). */
export function fluxoDiario(
  transacoes: TransacaoComRelacoes[],
  inicio: Date,
  fim: Date,
): PontoFluxo[] {
  const pontos = new Map<string, PontoFluxo>();

  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  while (cursor < fim) {
    pontos.set(chaveLocal(cursor), {
      dia: chaveLocal(cursor),
      rotulo: String(cursor.getDate()).padStart(2, "0"),
      entradas: 0,
      saidas: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const t of transacoes) {
    if (t.status !== "approved") continue;
    const ponto = pontos.get(chaveLocal(new Date(t.ocorrido_em)));
    if (!ponto) continue;
    if (t.tipo === "entrada") ponto.entradas += t.valor;
    else ponto.saidas += t.valor;
  }

  return [...pontos.values()];
}

export type FatiaCategoria = { nome: string; cor: string; valor: number };

export function porCategoria(
  transacoes: TransacaoComRelacoes[],
  tipo: TipoTransacao,
): FatiaCategoria[] {
  const mapa = new Map<string, FatiaCategoria>();

  for (const t of transacoes) {
    if (t.tipo !== tipo || t.status !== "approved") continue;
    const nome = t.categoria?.nome ?? "Sem categoria";
    const cor = t.categoria?.cor ?? "#94A3B8";
    const atual = mapa.get(nome) ?? { nome, cor, valor: 0 };
    atual.valor += t.valor;
    mapa.set(nome, atual);
  }

  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}
