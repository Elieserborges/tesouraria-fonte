"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Navega entre meses mantendo os demais filtros da URL. */
export function SeletorMes({ mes }: { mes: string }) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();

  function irPara(novoMes: string) {
    const proximos = new URLSearchParams(params.toString());
    proximos.set("mes", novoMes);
    router.push(`${caminho}?${proximos.toString()}`);
  }

  function deslocar(passo: number) {
    const [ano, m] = mes.split("-").map(Number);
    const data = new Date(ano, m - 1 + passo, 1);
    irPara(`${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="flex items-center gap-1 rounded-xl border border-borda bg-superficie p-1">
      <button
        type="button"
        onClick={() => deslocar(-1)}
        aria-label="Mês anterior"
        className="grid size-8 place-items-center rounded-lg text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
      >
        <ChevronLeft size={16} />
      </button>

      <input
        type="month"
        value={mes}
        onChange={(e) => e.target.value && irPara(e.target.value)}
        aria-label="Mês de referência"
        className="bg-transparent px-2 py-1 text-sm text-texto outline-none"
      />

      <button
        type="button"
        onClick={() => deslocar(1)}
        aria-label="Próximo mês"
        className="grid size-8 place-items-center rounded-lg text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
