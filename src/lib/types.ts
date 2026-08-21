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
  /** Transferência entre contas da igreja: entra no saldo, fica fora do resultado. */
  eh_transferencia: boolean;
};

/** Como o dinheiro entrou ou saiu — derivada do payload pelo banco. */
export type FormaPagamento =
  | "pix"
  | "maquininha"
  | "qr_presencial"
  | "checkout"
  | "cartao_fisico"
  | "cofrinho"
  | "transferencia"
  | "manual"
  | "outros";

export const FORMA_LABEL: Record<FormaPagamento, string> = {
  pix: "Pix",
  maquininha: "Maquininha",
  qr_presencial: "QR Code presencial",
  checkout: "Checkout / link",
  cartao_fisico: "Cartão físico",
  cofrinho: "Cofrinho",
  transferencia: "Transferência",
  manual: "Lançamento manual",
  outros: "Outros",
};

export type Transacao = {
  id: string;
  conta_id: string | null;
  categoria_id: string | null;
  tipo: TipoTransacao;
  /** Líquido: o que entrou ou saiu da conta. É este que forma o saldo. */
  valor: number;
  /** O que foi cobrado da pessoa, antes das tarifas. */
  valor_bruto: number | null;
  /** Tarifa e impostos retidos pelo Mercado Pago. */
  tarifa: number;
  descricao: string | null;
  contraparte: string | null;
  metodo: string | null;
  status: string;
  ocorrido_em: string;
  origem: string;
  mp_payment_id: string | null;
  observacao: string | null;
  categoria_automatica: boolean;
  forma: FormaPagamento | null;
  criado_em: string;
};

export type ModoRegra = "exata" | "contem";
export type CampoRegra = "descricao" | "contraparte";

/** Regra "texto + tipo => categoria", aplicada automaticamente. */
export type RegraCategoria = {
  id: string;
  padrao: string;
  modo: ModoRegra;
  campo: CampoRegra;
  tipo: TipoTransacao;
  categoria_id: string;
  criado_em: string;
};

export const CAMPO_LABEL: Record<CampoRegra, string> = {
  descricao: "descrição",
  contraparte: "pessoa",
};

/** Nome mascarado pela API do Mercado Pago, ou e-mail — não serve de regra. */
export function nomeUtil(contraparte: string | null | undefined): boolean {
  const n = (contraparte ?? "").trim();
  return n.length >= 4 && !/^[Xx]+$/.test(n) && !n.includes("@");
}

/**
 * Escolhe o padrão de uma regra a partir da descrição.
 *
 * Muitas descrições trazem o nome da pessoa no fim — "Inscrição Café com
 * Dança - Isabela Machado". Casar o texto inteiro criaria uma regra por
 * comprador e não automatizaria nada. Quando há um separador, usamos só a
 * parte da frente e casamos por trecho.
 */
export function padraoDaDescricao(descricao: string | null | undefined): {
  padrao: string;
  modo: ModoRegra;
} {
  const completo = normalizarPadrao(descricao);
  const separador = completo.match(/^(.{6,}?)\s+[-–—:]\s+\S/);

  if (separador) {
    return { padrao: separador[1].trim(), modo: "contem" };
  }
  return { padrao: completo, modo: "exata" };
}

/**
 * Decide sobre o que a regra vai casar.
 *
 * Com descrição, ela manda — identifica o motivo do pagamento. Sem descrição
 * (o caso de todo Pix direto), o que resta é quem pagou: um dizimista
 * recorrente vira uma regra só. Se não há nem um nem outro, não há regra.
 */
export function padraoDaTransacao(transacao: {
  descricao?: string | null;
  contraparte?: string | null;
}): { padrao: string; modo: ModoRegra; campo: CampoRegra } | null {
  const daDescricao = padraoDaDescricao(transacao.descricao);
  if (daDescricao.padrao !== "") {
    return { ...daDescricao, campo: "descricao" };
  }

  if (nomeUtil(transacao.contraparte)) {
    return {
      padrao: normalizarPadrao(transacao.contraparte),
      modo: "exata",
      campo: "contraparte",
    };
  }

  return null;
}

export type RegraComUso = RegraCategoria & {
  categoria: Pick<Categoria, "id" | "nome" | "cor"> | null;
  atingidas: number;
};

/** Normaliza a descrição do jeito que o banco compara nas regras. */
export function normalizarPadrao(descricao: string | null | undefined): string {
  return (descricao ?? "").trim().toLowerCase();
}

export const ROTULO_SEM_DESCRICAO = "(sem descrição)";

/** Transação já com conta e categoria embutidas (join do Supabase). */
export type TransacaoComRelacoes = Transacao & {
  conta: Pick<Conta, "id" | "slug" | "nome" | "cor"> | null;
  categoria: Pick<Categoria, "id" | "nome" | "cor" | "eh_transferencia"> | null;
};

/*
 * Status que mexem no dinheiro.
 *
 * `approved` é o pagamento concluído. `authorized` é a compra no cartão que
 * ainda não foi capturada pelo lojista: o valor já está bloqueado e some do
 * saldo disponível, mas a linha só aparece no extrato quando a captura
 * acontece, dias depois.
 *
 * Contar só o `approved` fazia o sistema mostrar dinheiro que a igreja já não
 * podia gastar. Contar os dois é o que o próprio aplicativo do Mercado Pago
 * faz no "Disponível".
 *
 * Uma autorização pode expirar sem captura, e aí o dinheiro volta — por isso
 * o cron revisita esses lançamentos até eles chegarem a um estado final.
 */
export const STATUS_NO_SALDO = ["approved", "authorized"] as const;

export function contaNoSaldo(status: string): boolean {
  return (STATUS_NO_SALDO as readonly string[]).includes(status);
}

/** Compra bloqueada no cartão, ainda sem captura. */
export function aguardandoCaptura(status: string): boolean {
  return status === "authorized";
}

/** Movimento que só troca dinheiro de conta — não é receita nem despesa. */
export function ehTransferencia(t: TransacaoComRelacoes): boolean {
  return t.categoria?.eh_transferencia === true;
}

/*
 * O rótulo do papel, que é o que a pessoa lê.
 *
 * A chave continua sendo "conselho" porque é o valor gravado no banco, num
 * tipo enumerado — renomear exigiria migração e não muda nada para quem usa.
 * Aqui só se decide o nome que aparece na tela.
 */
export const PAPEL_LABEL: Record<PapelUsuario, string> = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  conselho: "Diretoria",
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

/** Edição de um evento recorrente — Face a Face Ago/2026, Cura-me 2026… */
export type Evento = {
  id: string;
  nome: string;
  categoria_nome: string;
  inicio: string;
  fim: string;
  observacao: string | null;
};

/** Edição com o que ela arrecadou e gastou, calculado pela janela de datas. */
export type EventoComResultado = Omit<Evento, "id"> & {
  evento_id: string;
  entradas: number;
  saidas: number;
  resultado: number;
  lancamentos: number;
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
