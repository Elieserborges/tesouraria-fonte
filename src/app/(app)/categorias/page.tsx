import type { Metadata } from "next";
import {
  GerenciadorCategorias,
  type CategoriaComUso,
} from "@/components/categorias/gerenciador-categorias";
import { ListaRegras } from "@/components/categorias/lista-regras";
import { listarCategorias, listarRegras, listarTransacoes } from "@/lib/dados";
import { obterSessao } from "@/lib/supabase/server";
import { podeEditar } from "@/lib/types";

export const metadata: Metadata = { title: "Categorias · Fluxx Finance" };

export default async function PaginaCategorias() {
  const sessao = await obterSessao();
  const editavel = podeEditar(sessao?.perfil?.papel);

  // Uso das categorias nos últimos 12 meses.
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);

  const [categorias, transacoes, regras] = await Promise.all([
    listarCategorias(),
    listarTransacoes({ inicio, limite: 5000 }),
    listarRegras(),
  ]);

  const uso = new Map<string, { usos: number; total: number }>();
  for (const t of transacoes) {
    if (!t.categoria_id) continue;
    const atual = uso.get(t.categoria_id) ?? { usos: 0, total: 0 };
    atual.usos += 1;
    atual.total += t.valor;
    uso.set(t.categoria_id, atual);
  }

  const comUso: CategoriaComUso[] = categorias.map((c) => ({
    ...c,
    usos: uso.get(c.id)?.usos ?? 0,
    total: uso.get(c.id)?.total ?? 0,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-texto">
          Categorias
        </h1>
        <p className="text-sm text-texto-suave">
          Usadas para classificar as movimentações. Números referentes aos últimos
          12 meses.
        </p>
      </header>

      <GerenciadorCategorias categorias={comUso} editavel={editavel} />

      <ListaRegras regras={regras} editavel={editavel} />
    </div>
  );
}
