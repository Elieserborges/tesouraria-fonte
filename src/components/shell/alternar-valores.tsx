"use client";

import { useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";

const EVENTO = "valores:mudou";

function inscrever(aoMudar: () => void) {
  window.addEventListener(EVENTO, aoMudar);
  return () => window.removeEventListener(EVENTO, aoMudar);
}

const estaOculto = () => document.documentElement.dataset.valores === "ocultos";

/**
 * Esconde os valores em dinheiro da tela — útil para conferir algo com
 * outra pessoa por perto, ou projetar o painel numa reunião.
 *
 * Assim como o tema, o estado real vive num atributo do <html> e é aplicado
 * por um script antes da primeira pintura. Sem isso os valores apareceriam
 * por um instante a cada carregamento, o que anularia o propósito.
 */
export function AlternarValores({ comRotulo = false }: { comRotulo?: boolean }) {
  const oculto = useSyncExternalStore(inscrever, estaOculto, () => false);

  function alternar() {
    const proximo = !oculto;
    if (proximo) document.documentElement.dataset.valores = "ocultos";
    else delete document.documentElement.dataset.valores;
    localStorage.setItem("valores", proximo ? "ocultos" : "visiveis");
    window.dispatchEvent(new Event(EVENTO));
  }

  const rotulo = oculto ? "Mostrar valores" : "Ocultar valores";
  const Icone = oculto ? EyeOff : Eye;

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={rotulo}
      aria-pressed={oculto}
      title={rotulo}
      className={
        comRotulo
          ? "flex flex-1 items-center justify-center gap-2 rounded-lg border border-borda px-3 py-2 text-sm text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
          : "grid size-9 place-items-center rounded-lg border border-borda text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
      }
    >
      <Icone size={15} aria-hidden />
      {comRotulo && <span>{rotulo}</span>}
    </button>
  );
}
