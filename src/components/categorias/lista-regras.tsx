"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Trash2, Wand2, X } from "lucide-react";
import { atualizarRegra, removerRegra } from "@/app/(app)/categorias/actions";
import {
  CAMPO_LABEL,
  ROTULO_SEM_DESCRICAO,
  type CampoRegra,
  type ModoRegra,
  type RegraComUso,
} from "@/lib/types";

function Editor({
  regra,
  aoFechar,
  aoResultado,
}: {
  regra: RegraComUso;
  aoFechar: () => void;
  aoResultado: (msg: string | null, erro: string | null) => void;
}) {
  const [padrao, setPadrao] = useState(regra.padrao);
  const [modo, setModo] = useState<ModoRegra>(regra.modo);
  const [campo, setCampo] = useState<CampoRegra>(regra.campo);
  const [pendente, iniciar] = useTransition();

  function salvar() {
    iniciar(async () => {
      const r = await atualizarRegra(regra.id, padrao, modo, campo);
      if (r.erro) aoResultado(null, r.erro);
      else {
        aoResultado(r.sucesso ?? null, null);
        aoFechar();
      }
    });
  }

  return (
    <div className="space-y-3 bg-superficie-2/60 px-5 py-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-texto">Comparar com</span>
        <select
          value={campo}
          onChange={(e) => setCampo(e.target.value as CampoRegra)}
          className="w-full rounded-xl border border-borda bg-superficie px-3 py-2 text-sm text-texto outline-none focus:border-primaria focus:ring-2 focus:ring-primaria/25"
        >
          <option value="descricao">Descrição da movimentação</option>
          <option value="contraparte">Nome de quem pagou ou recebeu</option>
        </select>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-texto">Texto da regra</span>
        <input
          value={padrao}
          onChange={(e) => setPadrao(e.target.value)}
          className="w-full rounded-xl border border-borda bg-superficie px-3 py-2 text-sm text-texto outline-none focus:border-primaria focus:ring-2 focus:ring-primaria/25"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-texto">Como comparar</legend>
        {(
          [
            ["contem", "Contém este texto", "Pega descrições que variam no fim, como o nome de quem comprou."],
            ["exata", "Descrição idêntica", "Só casa quando a descrição é exatamente este texto."],
          ] as const
        ).map(([valor, titulo, ajuda]) => (
          <label key={valor} className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="radio"
              name={`modo-${regra.id}`}
              checked={modo === valor}
              onChange={() => setModo(valor)}
              className="mt-1 size-4 accent-[var(--primaria)]"
            />
            <span>
              <span className="block text-texto">{titulo}</span>
              <span className="block text-xs text-texto-suave">{ajuda}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={pendente}
          className="flex items-center gap-1.5 rounded-xl bg-primaria px-3 py-2 text-sm font-semibold text-primaria-contraste transition hover:opacity-90 disabled:opacity-60"
        >
          <Check size={15} aria-hidden />
          {pendente ? "Aplicando…" : "Salvar e aplicar"}
        </button>
        <button
          type="button"
          onClick={aoFechar}
          className="rounded-xl px-3 py-2 text-sm text-texto-suave transition hover:text-texto"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function ListaRegras({
  regras,
  editavel,
}: {
  regras: RegraComUso[];
  editavel: boolean;
}) {
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function remover(regra: RegraComUso) {
    const rotulo = regra.padrao || ROTULO_SEM_DESCRICAO;
    const limpar = confirm(
      `Remover a regra de "${rotulo}"?\n\n` +
        `OK = remover a regra E tirar a categoria das ${regra.atingidas} transações que ela classificou.\n` +
        "Cancelar = manter as transações como estão (aparecerá outra pergunta).",
    );
    if (!limpar && !confirm("Remover a regra mantendo as transações categorizadas?")) {
      return;
    }

    setErro(null);
    setMensagem(null);
    iniciar(async () => {
      const r = await removerRegra(regra.id, limpar);
      if (r.erro) setErro(r.erro);
      else setMensagem(r.sucesso ?? null);
    });
  }

  return (
    <section className="cartao overflow-hidden">
      <header className="border-b border-borda px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-texto">
          <Wand2 size={15} aria-hidden />
          Regras automáticas
        </h2>
        <p className="mt-1 text-xs text-texto-suave">
          Criadas quando você categoriza uma transação. Se a regra pegou poucas
          transações, encurte o texto — ex.: deixe só{" "}
          <em>inscrição café com dança</em> para valer para todos os inscritos.
          Trocar a categoria de uma transação atualiza a regra e todas as que
          ela já havia classificado; as que você marcou à mão ficam como estão.
          Pix sem descrição vira regra pelo nome de quem pagou.
        </p>
      </header>

      {erro && (
        <p role="alert" className="mx-5 mt-3 rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">
          {erro}
        </p>
      )}
      {mensagem && (
        <p className="mx-5 mt-3 rounded-lg bg-verde-400/10 px-3 py-2 text-sm text-entrada">
          {mensagem}
        </p>
      )}

      {regras.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-texto-suave">
          Nenhuma regra ainda. Categorize uma transação e a regra aparece aqui.
        </p>
      ) : (
        <ul className={pendente ? "opacity-60" : undefined}>
          {regras.map((r) => (
            <li key={r.id} className="border-b border-borda/60 last:border-0">
              <div className="flex items-center gap-3 px-5 py-3">
                <span
                  aria-hidden
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    r.tipo === "entrada"
                      ? "bg-verde-400/15 text-entrada"
                      : "bg-alerta/12 text-saida"
                  }`}
                  title={r.tipo === "entrada" ? "Entradas" : "Saídas"}
                >
                  {r.tipo === "entrada" ? "↓" : "↑"}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-texto">
                    {r.padrao || <em className="text-texto-suave">{ROTULO_SEM_DESCRICAO}</em>}
                  </span>
                  <span className="text-xs text-texto-suave">
                    {CAMPO_LABEL[r.campo]} ·{" "}
                    {r.modo === "contem" ? "contém" : "idêntica"} · {r.atingidas}{" "}
                    {r.atingidas === 1 ? "transação" : "transações"}
                  </span>
                </span>

                {r.categoria && (
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: `${r.categoria.cor}1f`,
                      color: r.categoria.cor,
                    }}
                  >
                    {r.categoria.nome}
                  </span>
                )}

                {editavel && (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setEditando(editando === r.id ? null : r.id)}
                      aria-label={`Editar regra de ${r.padrao || ROTULO_SEM_DESCRICAO}`}
                      className="rounded-lg p-1.5 text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                    >
                      {editando === r.id ? <X size={15} /> : <Pencil size={15} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => remover(r)}
                      aria-label={`Remover regra de ${r.padrao || ROTULO_SEM_DESCRICAO}`}
                      className="rounded-lg p-1.5 text-texto-suave transition hover:bg-alerta/10 hover:text-alerta"
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                )}
              </div>

              {editando === r.id && (
                <Editor
                  regra={r}
                  aoFechar={() => setEditando(null)}
                  aoResultado={(msg, err) => {
                    setMensagem(msg);
                    setErro(err);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
