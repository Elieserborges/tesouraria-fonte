"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Tema = "claro" | "escuro";

const EVENTO = "tema:mudou";

function inscrever(aoMudar: () => void) {
  window.addEventListener(EVENTO, aoMudar);
  return () => window.removeEventListener(EVENTO, aoMudar);
}

const lerDoDom = (): Tema =>
  (document.documentElement.dataset.tema as Tema) ?? "claro";

/**
 * O tema real vive no `data-tema` do <html> (aplicado por um script inline
 * antes da hidratação). Aqui apenas lemos esse estado externo.
 */
export function AlternarTema() {
  const tema = useSyncExternalStore(inscrever, lerDoDom, () => "claro" as Tema);

  function alternar() {
    const proximo: Tema = tema === "claro" ? "escuro" : "claro";
    document.documentElement.dataset.tema = proximo;
    localStorage.setItem("tema", proximo);
    window.dispatchEvent(new Event(EVENTO));
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={tema === "claro" ? "Ativar tema escuro" : "Ativar tema claro"}
      className="grid size-9 place-items-center rounded-lg border border-borda text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
    >
      {tema === "claro" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
