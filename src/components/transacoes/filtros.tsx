"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import type { Categoria, Conta } from "@/lib/types";

const CLASSE_CAMPO =
  "rounded-xl border border-borda bg-superficie px-3 py-2 text-sm text-texto outline-none transition focus:border-primaria focus:ring-2 focus:ring-primaria/25";

export function Filtros({
  contas,
  categorias,
}: {
  contas: Conta[];
  categorias: Categoria[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function atualizar(chave: string, valor: string) {
    const proximos = new URLSearchParams(params.toString());
    if (valor) proximos.set(chave, valor);
    else proximos.delete(chave);
    router.push(`/transacoes?${proximos.toString()}`);
  }

  const temFiltro = ["conta", "categoria", "tipo", "busca"].some((c) =>
    params.get(c),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          atualizar("busca", String(dados.get("busca") ?? ""));
        }}
        className="relative"
      >
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
        />
        <input
          name="busca"
          type="search"
          defaultValue={params.get("busca") ?? ""}
          placeholder="Buscar descrição ou pessoa"
          aria-label="Buscar transações"
          className={`${CLASSE_CAMPO} w-56 pl-9`}
        />
      </form>

      <select
        value={params.get("tipo") ?? ""}
        onChange={(e) => atualizar("tipo", e.target.value)}
        aria-label="Filtrar por tipo"
        className={CLASSE_CAMPO}
      >
        <option value="">Todos os tipos</option>
        <option value="entrada">Entradas</option>
        <option value="saida">Saídas</option>
      </select>

      <select
        value={params.get("conta") ?? ""}
        onChange={(e) => atualizar("conta", e.target.value)}
        aria-label="Filtrar por conta"
        className={CLASSE_CAMPO}
      >
        <option value="">Todas as contas</option>
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>

      <select
        value={params.get("categoria") ?? ""}
        onChange={(e) => atualizar("categoria", e.target.value)}
        aria-label="Filtrar por categoria"
        className={CLASSE_CAMPO}
      >
        <option value="">Todas as categorias</option>
        <option value="sem-categoria">⚠ Sem categoria</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.tipo === "entrada" ? "↓" : "↑"} {c.nome}
          </option>
        ))}
      </select>

      {temFiltro && (
        <button
          type="button"
          onClick={() => {
            const mes = params.get("mes");
            router.push(`/transacoes${mes ? `?mes=${mes}` : ""}`);
          }}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
        >
          <X size={15} aria-hidden />
          Limpar
        </button>
      )}
    </div>
  );
}
