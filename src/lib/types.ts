export type PapelUsuario = "admin" | "tesoureiro" | "conselho";
export type TipoTransacao = "entrada" | "saida";

export type Perfil = {
  id: string;
  nome: string;
  email: string | null;
  papel: PapelUsuario;
  criado_em: string;
};

export type Conta = {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  mp_user_id: string | null;
  cor: string;
  ativa: boolean;
};

export type Categoria = {
  id: string;
  nome: string;
  tipo: TipoTransacao;
  cor: string;
};

export type Transacao = {
  id: string;
  conta_id: string | null;
  categoria_id: string | null;
  tipo: TipoTransacao;
  valor: number;
  descricao: string | null;
  contraparte: string | null;
  metodo: string | null;
  status: string;
  ocorrido_em: string;
  origem: string;
  mp_payment_id: string | null;
  observacao: string | null;
  criado_em: string;
};

/** Transação já com conta e categoria embutidas (join do Supabase). */
export type TransacaoComRelacoes = Transacao & {
  conta: Pick<Conta, "id" | "nome" | "cor"> | null;
  categoria: Pick<Categoria, "id" | "nome" | "cor"> | null;
};

export const PAPEL_LABEL: Record<PapelUsuario, string> = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  conselho: "Conselho Fiscal",
};

export function podeEditar(papel: PapelUsuario | undefined | null): boolean {
  return papel === "admin" || papel === "tesoureiro";
}

export function ehAdmin(papel: PapelUsuario | undefined | null): boolean {
  return papel === "admin";
}

export const PAPEL_DESCRICAO: Record<PapelUsuario, string> = {
  admin: "Acesso total, incluindo a gestão de usuários.",
  tesoureiro: "Lança, categoriza e gerencia categorias.",
  conselho: "Somente leitura dos painéis e transações.",
};

/** Usuário do Auth combinado com o perfil de acesso. */
export type UsuarioGerenciado = {
  id: string;
  email: string;
  nome: string;
  papel: PapelUsuario;
  criado_em: string;
  ultimo_acesso: string | null;
  confirmado: boolean;
};
