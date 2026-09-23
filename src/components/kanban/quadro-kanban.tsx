"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CornerDownRight,
  Info,
  Pencil,
  Plus,
  Printer,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/format";
import { MINIMO_CARTAO, type KanbanCartao, type KanbanEtapa } from "@/lib/types";
import {
  excluirCartao,
  excluirEtapa,
  moverCartao,
  moverEtapa,
  salvarCartao,
  salvarEtapa,
  type EstadoKanban,
} from "@/app/(app)/kanban/actions";

const CAMPO =
  "w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm text-texto outline-none transition focus:border-marca-400";

type FormCartao = { etapaId: string; cartao: KanbanCartao | null };

/**
 * O quadro: colunas que a tesouraria inventa e cartões que andam entre elas.
 *
 * No computador o cartão se arrasta; no celular arrastar não funciona bem, e
 * por isso cada cartão tem o botão "Mover", que lista as outras colunas. As
 * duas formas chamam a mesma ação — a tela nunca depende do mouse.
 *
 * A troca aparece na hora e só depois é confirmada pelo servidor: esperar a
 * resposta para o cartão sair do lugar faz o quadro parecer travado.
 */
export function QuadroKanban({
  etapas,
  cartoes,
  categorias,
  editavel,
}: {
  etapas: KanbanEtapa[];
  cartoes: KanbanCartao[];
  categorias: string[];
  editavel: boolean;
}) {
  const [lista, setLista] = useState(cartoes);
  const [erro, setErro] = useState<string | null>(null);
  const [emForm, setEmForm] = useState<FormCartao | null>(null);
  const [editandoEtapas, setEditandoEtapas] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [movendo, setMovendo] = useState<string | null>(null);
  const [motivoAberto, setMotivoAberto] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  /*
   * O servidor manda a verdade depois de cada ação, e ela substitui o palpite
   * que a tela já tinha desenhado. O ajuste é feito durante a renderização, e
   * não num efeito: assim o quadro nunca chega a aparecer uma vez com a lista
   * velha para logo se corrigir.
   */
  const [recebidos, setRecebidos] = useState(cartoes);
  if (recebidos !== cartoes) {
    setRecebidos(cartoes);
    setLista(cartoes);
  }

  async function aplicar(acao: Promise<EstadoKanban>) {
    const resposta = await acao;
    setErro(resposta?.erro ?? null);
  }

  async function mover(cartaoId: string, etapaId: string, antesDe: string | null) {
    setMovendo(null);
    setArrastando(null);
    if (antesDe === cartaoId) return;

    setLista((atual) => {
      const alvo = atual.find((c) => c.id === cartaoId);
      if (!alvo) return atual;
      const sem = atual.filter((c) => c.id !== cartaoId);
      const movido = { ...alvo, etapa_id: etapaId };
      const indice = antesDe ? sem.findIndex((c) => c.id === antesDe) : -1;
      return indice < 0
        ? [...sem, movido]
        : [...sem.slice(0, indice), movido, ...sem.slice(indice)];
    });

    await aplicar(moverCartao(cartaoId, etapaId, antesDe));
  }

  async function enviarCartao(dados: FormData) {
    setSalvando(true);
    const resposta = await salvarCartao(dados);
    setSalvando(false);
    setErro(resposta.erro ?? null);
    if (!resposta.erro) setEmForm(null);
  }

  async function removerCartao(cartao: KanbanCartao) {
    if (!confirm(`Excluir o cartão "${cartao.titulo}"?`)) return;
    setLista((atual) => atual.filter((c) => c.id !== cartao.id));
    await aplicar(excluirCartao(cartao.id));
  }

  async function enviarEtapa(dados: FormData) {
    const resposta = await salvarEtapa(dados);
    setErro(resposta.erro ?? null);
  }

  async function removerEtapa(etapa: KanbanEtapa) {
    if (!confirm(`Excluir a etapa "${etapa.nome}"?`)) return;
    await aplicar(excluirEtapa(etapa.id));
  }

  const emEdicao = emForm?.cartao ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-texto-suave">
          {editavel
            ? "Arraste o cartão ou toque em Mover."
            : "Seu perfil vê o quadro, mas não altera."}
        </p>
        {/*
          Exportar fica aqui, e não só na aba Exportar, porque quem precisa
          levar o quadro para uma reunião está olhando para ele neste momento.
          Vale também para quem só tem leitura: entregar o quadro não é
          alterá-lo.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/kanban/imprimir"
            target="_blank"
            rel="noopener"
            prefetch={false}
            className="inline-flex items-center gap-2 rounded-lg border border-borda px-3 py-2 text-sm font-medium text-texto transition hover:bg-superficie-2"
          >
            <Printer size={15} aria-hidden /> Imprimir
          </Link>
          {editavel && (
            <button
              type="button"
              onClick={() => setEditandoEtapas(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-borda px-3 py-2 text-sm font-medium text-texto transition hover:bg-superficie-2"
            >
              <SlidersHorizontal size={15} aria-hidden /> Editar etapas
            </button>
          )}
        </div>
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">
          {erro}
        </p>
      )}

      {etapas.length === 0 ? (
        <p className="cartao px-5 py-12 text-center text-sm text-texto-suave">
          O quadro ainda não tem etapas. Crie a primeira em “Editar etapas”.
        </p>
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          {etapas.map((etapa) => {
            const daEtapa = lista.filter((c) => c.etapa_id === etapa.id);
            const total = daEtapa.reduce((soma, c) => soma + (c.valor ?? 0), 0);

            return (
              <section
                key={etapa.id}
                onDragOver={(e) => {
                  if (arrastando) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (arrastando) void mover(arrastando, etapa.id, null);
                }}
                className="flex w-[82vw] max-w-[19rem] shrink-0 snap-start flex-col rounded-2xl border border-borda bg-superficie-2/60 sm:w-72"
              >
                <header className="flex items-center gap-2 border-b border-borda px-3 py-2.5">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: etapa.cor }}
                  />
                  <h2 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-texto">
                    {etapa.nome}
                  </h2>
                  <span className="shrink-0 text-xs tabular-nums text-texto-suave">
                    {daEtapa.length}
                  </span>
                </header>

                {total > 0 && (
                  <p className="valor-sensivel px-3 pt-2 text-xs font-medium tabular-nums text-texto-suave">
                    {formatarMoeda(total)}
                  </p>
                )}

                <ul className="flex-1 space-y-2 p-3">
                  {daEtapa.length === 0 && (
                    <li className="py-8 text-center text-xs uppercase tracking-wide text-texto-suave/60">
                      vazio
                    </li>
                  )}

                  {daEtapa.map((cartao) => (
                    <li key={cartao.id}>
                      <article
                        draggable={editavel}
                        onDragStart={() => setArrastando(cartao.id)}
                        onDragEnd={() => setArrastando(null)}
                        onDragOver={(e) => {
                          if (arrastando && arrastando !== cartao.id) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          if (!arrastando) return;
                          e.preventDefault();
                          e.stopPropagation();
                          void mover(arrastando, etapa.id, cartao.id);
                        }}
                        className={`rounded-xl border border-borda bg-superficie p-3 shadow-sm transition ${
                          arrastando === cartao.id ? "opacity-40" : ""
                        } ${editavel ? "cursor-grab active:cursor-grabbing" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-sm font-medium text-texto">
                            {cartao.titulo}
                          </p>
                          {cartao.valor !== null && (
                            <span className="valor-sensivel shrink-0 text-sm font-semibold tabular-nums text-texto">
                              {formatarMoeda(cartao.valor)}
                            </span>
                          )}
                        </div>

                        {/*
                          Responsável em falta aparece em destaque, e não
                          escondido: o cartão sem dono é o que atrasa, e agora
                          o formulário exige um — só os antigos podem estar sem.
                        */}
                        <p className="mt-1 text-xs text-texto-suave">
                          {cartao.responsavel ?? (
                            <span className="text-atencao">sem responsável</span>
                          )}
                          {cartao.prazo &&
                            ` · prazo ${formatarData(`${cartao.prazo}T12:00:00`)}`}
                        </p>

                        <p className="mt-0.5 text-[0.7rem] text-texto-suave/70">
                          criado em {formatarData(cartao.criado_em)}
                        </p>

                        {cartao.categoria_nome && (
                          <span className="mt-2 inline-block rounded-full bg-superficie-2 px-2 py-0.5 text-[0.7rem] text-texto-suave">
                            {cartao.categoria_nome}
                          </span>
                        )}

                        {/*
                          O motivo fica guardado atrás do botão.

                          Ele é um parágrafo, e um parágrafo em cada cartão
                          transforma a coluna numa parede de texto onde não se
                          acha mais nada. Quem precisa da justificativa abre a
                          do cartão que interessa; no PDF ela sai por extenso,
                          porque lá o documento é para ler.
                        */}
                        {(cartao.motivo || editavel) && (
                          <div className="mt-2 flex items-center gap-1 border-t border-borda pt-2">
                            {cartao.motivo && (
                              <button
                                type="button"
                                aria-expanded={motivoAberto === cartao.id}
                                onClick={() =>
                                  setMotivoAberto(
                                    motivoAberto === cartao.id ? null : cartao.id,
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                              >
                                <Info size={13} aria-hidden /> Motivo
                              </button>
                            )}
                            {editavel && (
                              <>
                            <button
                              type="button"
                              onClick={() =>
                                setMovendo(movendo === cartao.id ? null : cartao.id)
                              }
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                            >
                              <CornerDownRight size={13} aria-hidden /> Mover
                            </button>
                            <button
                              type="button"
                              onClick={() => setEmForm({ etapaId: etapa.id, cartao })}
                              aria-label={`Editar ${cartao.titulo}`}
                              className="ml-auto rounded-lg p-1.5 text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removerCartao(cartao)}
                              aria-label={`Excluir ${cartao.titulo}`}
                              className="rounded-lg p-1.5 text-texto-suave transition hover:bg-alerta/10 hover:text-alerta"
                            >
                              <Trash2 size={13} />
                            </button>
                              </>
                            )}
                          </div>
                        )}

                        {motivoAberto === cartao.id && cartao.motivo && (
                          <p className="mt-2 rounded-lg bg-superficie-2 p-2 text-xs text-texto-suave">
                            {cartao.motivo}
                          </p>
                        )}

                        {movendo === cartao.id && (
                          <div className="mt-2 space-y-1 rounded-lg bg-superficie-2 p-2">
                            <p className="px-1 text-[0.7rem] uppercase tracking-wide text-texto-suave">
                              Mover para
                            </p>
                            {etapas
                              .filter((destino) => destino.id !== etapa.id)
                              .map((destino) => (
                                <button
                                  key={destino.id}
                                  type="button"
                                  onClick={() => mover(cartao.id, destino.id, null)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-texto transition hover:bg-superficie"
                                >
                                  <span
                                    aria-hidden
                                    className="size-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: destino.cor }}
                                  />
                                  <span className="truncate">{destino.nome}</span>
                                </button>
                              ))}
                          </div>
                        )}
                      </article>
                    </li>
                  ))}
                </ul>

                {editavel && (
                  <button
                    type="button"
                    onClick={() => setEmForm({ etapaId: etapa.id, cartao: null })}
                    className="flex items-center justify-center gap-1.5 border-t border-borda px-3 py-2.5 text-xs font-medium text-texto-suave transition hover:bg-superficie hover:text-texto"
                  >
                    <Plus size={14} aria-hidden /> Adicionar
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {emForm &&
        createPortal(
          <Modal
            titulo={emEdicao ? "Editar cartão" : "Novo cartão"}
            aoFechar={() => setEmForm(null)}
          >
            <form action={enviarCartao} className="space-y-3">
              {emEdicao && <input type="hidden" name="id" value={emEdicao.id} />}

              <label className="block text-sm">
                <span className="mb-1 block text-xs text-texto-suave">Título</span>
                <input
                  name="titulo"
                  defaultValue={emEdicao?.titulo ?? ""}
                  required
                  minLength={MINIMO_CARTAO}
                  autoFocus
                  className={CAMPO}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-texto-suave">Etapa</span>
                  <select
                    name="etapa_id"
                    defaultValue={emEdicao?.etapa_id ?? emForm.etapaId}
                    className={CAMPO}
                  >
                    {etapas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-xs text-texto-suave">
                    Valor <span className="text-texto-suave/70">(opcional)</span>
                  </span>
                  <input
                    name="valor"
                    inputMode="decimal"
                    defaultValue={
                      emEdicao?.valor != null ? String(emEdicao.valor).replace(".", ",") : ""
                    }
                    placeholder="1.500,00"
                    className={`${CAMPO} text-right font-semibold tabular-nums`}
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-xs text-texto-suave">Responsável</span>
                  <input
                    name="responsavel"
                    defaultValue={emEdicao?.responsavel ?? ""}
                    required
                    minLength={MINIMO_CARTAO}
                    placeholder="quem toca isso"
                    className={CAMPO}
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-xs text-texto-suave">Prazo</span>
                  <input
                    type="date"
                    name="prazo"
                    defaultValue={emEdicao?.prazo ?? ""}
                    className={CAMPO}
                  />
                </label>

                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-xs text-texto-suave">Categoria</span>
                  <select
                    name="categoria_nome"
                    defaultValue={emEdicao?.categoria_nome ?? ""}
                    className={CAMPO}
                  >
                    <option value="">Sem categoria</option>
                    {categorias.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-xs text-texto-suave">Motivo</span>
                <textarea
                  name="motivo"
                  defaultValue={emEdicao?.motivo ?? ""}
                  rows={2}
                  required
                  minLength={MINIMO_CARTAO}
                  placeholder="por que isso precisa acontecer"
                  className={CAMPO}
                />
              </label>

              {/* A data de criação não se edita: ela é o registro de quando a
                  coisa começou a esperar. */}
              {emEdicao && (
                <p className="text-xs text-texto-suave">
                  Criado em {formatarDataHora(emEdicao.criado_em)}
                </p>
              )}

              <button
                type="submit"
                disabled={salvando}
                className="w-full rounded-lg bg-marca-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {salvando ? "Salvando…" : "Salvar cartão"}
              </button>
            </form>
          </Modal>,
          document.body,
        )}

      {editandoEtapas &&
        createPortal(
          <Modal titulo="Etapas do quadro" aoFechar={() => setEditandoEtapas(false)}>
            <div className="space-y-2">
              {etapas.map((etapa, indice) => (
                <form key={etapa.id} action={enviarEtapa} className="flex items-center gap-1.5">
                  <input type="hidden" name="id" value={etapa.id} />
                  <input
                    type="color"
                    name="cor"
                    defaultValue={etapa.cor}
                    aria-label={`Cor de ${etapa.nome}`}
                    className="size-8 shrink-0 cursor-pointer rounded-lg border border-borda bg-superficie"
                  />
                  <input
                    name="nome"
                    defaultValue={etapa.nome}
                    aria-label="Nome da etapa"
                    className={CAMPO}
                  />
                  <button
                    type="submit"
                    aria-label={`Salvar ${etapa.nome}`}
                    className="shrink-0 rounded-lg p-1.5 text-texto-suave transition hover:bg-superficie-2 hover:text-entrada"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    type="button"
                    disabled={indice === 0}
                    onClick={() => aplicar(moverEtapa(etapa.id, "esquerda"))}
                    aria-label={`Mover ${etapa.nome} para a esquerda`}
                    className="shrink-0 rounded-lg p-1.5 text-texto-suave transition hover:bg-superficie-2 hover:text-texto disabled:opacity-30"
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <button
                    type="button"
                    disabled={indice === etapas.length - 1}
                    onClick={() => aplicar(moverEtapa(etapa.id, "direita"))}
                    aria-label={`Mover ${etapa.nome} para a direita`}
                    className="shrink-0 rounded-lg p-1.5 text-texto-suave transition hover:bg-superficie-2 hover:text-texto disabled:opacity-30"
                  >
                    <ArrowRight size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removerEtapa(etapa)}
                    aria-label={`Excluir ${etapa.nome}`}
                    className="shrink-0 rounded-lg p-1.5 text-texto-suave transition hover:bg-alerta/10 hover:text-alerta"
                  >
                    <Trash2 size={15} />
                  </button>
                </form>
              ))}

              <form
                action={enviarEtapa}
                className="flex items-center gap-1.5 border-t border-borda pt-3"
              >
                <input
                  type="color"
                  name="cor"
                  defaultValue="#6366f1"
                  aria-label="Cor da nova etapa"
                  className="size-8 shrink-0 cursor-pointer rounded-lg border border-borda bg-superficie"
                />
                <input
                  name="nome"
                  placeholder="Nova etapa"
                  aria-label="Nome da nova etapa"
                  className={CAMPO}
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-marca-500 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Adicionar
                </button>
              </form>

              <p className="pt-1 text-xs text-texto-suave">
                A etapa só pode ser excluída depois de esvaziada — assim nenhum
                cartão some sem querer.
              </p>
            </div>
          </Modal>,
          document.body,
        )}
    </div>
  );
}

/**
 * A janela por cima do quadro.
 *
 * Vai para o `body` por `createPortal` porque o cabeçalho do aplicativo usa
 * `backdrop-filter`, e um ancestral com esse filtro passa a ser a referência
 * de qualquer `position: fixed` dentro dele — foi o que espremeu a gaveta do
 * celular contra o topo da tela.
 */
function Modal({
  titulo,
  aoFechar,
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={aoFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-borda bg-superficie p-5 shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-texto">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded-lg p-1 text-texto-suave transition hover:bg-superficie-2"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
