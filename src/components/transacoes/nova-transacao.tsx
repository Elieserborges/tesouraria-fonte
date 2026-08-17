"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";
import { criarTransacao, type EstadoFormulario } from "@/app/(app)/transacoes/actions";
import type { Categoria, Conta } from "@/lib/types";

const CLASSE_CAMPO =
  "w-full rounded-xl border border-borda bg-superficie-2 px-3 py-2.5 text-sm text-texto outline-none transition focus:border-primaria focus:ring-2 focus:ring-primaria/25";

function BotaoSalvar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-primaria px-4 py-2.5 text-sm font-semibold text-primaria-contraste transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Lançar"}
    </button>
  );
}

export function NovaTransacao({
  contas,
  categorias,
}: {
  contas: Conta[];
  categorias: Categoria[];
}) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<"entrada" | "saida">("saida");
  const [estado, acao] = useActionState<EstadoFormulario, FormData>(
    criarTransacao,
    {},
  );

  // Fecha o painel quando o lançamento é salvo (ajuste de estado durante a
  // renderização — o formulário desmonta e volta limpo na próxima abertura).
  const [ultimoSucesso, setUltimoSucesso] = useState<string | undefined>();
  if (estado.sucesso !== ultimoSucesso) {
    setUltimoSucesso(estado.sucesso);
    if (estado.sucesso) setAberto(false);
  }

  const agora = new Date();
  const dataPadrao = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex items-center gap-2 rounded-xl bg-primaria px-4 py-2.5 text-sm font-semibold text-primaria-contraste transition hover:opacity-90"
      >
        <Plus size={16} aria-hidden />
        Novo lançamento
      </button>
    );
  }

  return (
    <div className="cartao w-full p-5">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-texto">Lançamento manual</h2>
        <button
          type="button"
          onClick={() => setAberto(false)}
          aria-label="Fechar"
          className="rounded-lg p-1.5 text-texto-suave transition hover:bg-superficie-2"
        >
          <X size={16} />
        </button>
      </header>

      <form action={acao} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <fieldset className="sm:col-span-2 lg:col-span-3">
          <legend className="sr-only">Tipo</legend>
          <div className="inline-flex rounded-xl border border-borda p-1">
            {(["entrada", "saida"] as const).map((opcao) => (
              <label
                key={opcao}
                className={`cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                  tipo === opcao
                    ? opcao === "entrada"
                      ? "bg-verde-400 text-white"
                      : "bg-alerta text-white"
                    : "text-texto-suave hover:text-texto"
                }`}
              >
                <input
                  type="radio"
                  name="tipo"
                  value={opcao}
                  checked={tipo === opcao}
                  onChange={() => setTipo(opcao)}
                  className="sr-only"
                />
                {opcao === "entrada" ? "Entrada" : "Saída"}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-texto">Valor (R$)</span>
          <input
            name="valor"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            required
            className={CLASSE_CAMPO}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-texto">Data e hora</span>
          <input
            name="ocorrido_em"
            type="datetime-local"
            defaultValue={dataPadrao}
            required
            className={CLASSE_CAMPO}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-texto">Conta</span>
          <select name="conta_id" className={CLASSE_CAMPO} defaultValue="">
            <option value="">Sem conta</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-texto">Categoria</span>
          <select name="categoria_id" className={CLASSE_CAMPO} defaultValue="">
            <option value="">Sem categoria</option>
            {categorias
              .filter((c) => c.tipo === tipo)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
        </label>

        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-texto">Descrição</span>
          <input
            name="descricao"
            type="text"
            placeholder="Ex.: Conta de luz — julho"
            className={CLASSE_CAMPO}
          />
        </label>

        {estado.erro && (
          <p role="alert" className="sm:col-span-2 lg:col-span-3 rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">
            {estado.erro}
          </p>
        )}

        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
          <BotaoSalvar />
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-xl px-4 py-2.5 text-sm text-texto-suave transition hover:text-texto"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
