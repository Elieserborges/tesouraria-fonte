"use client";

import { Printer } from "lucide-react";

/**
 * Barra que só existe na tela — some no papel pela classe `nao-imprimir`.
 *
 * Não abre a caixa de impressão sozinha de propósito: esta página também é
 * um relatório legível, e um diálogo modal na abertura impede conferir os
 * números antes de gerar o arquivo.
 */
export function BotaoImprimir() {
  return (
    <div className="nao-imprimir flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borda bg-superficie-2 px-4 py-3">
      <p className="text-sm text-texto-suave">
        Na caixa de impressão, escolha <strong className="text-texto">Salvar como PDF</strong>.
      </p>
      <button
        type="button"
        onClick={() => window.print()}
        className="flex items-center gap-2 rounded-xl bg-primaria px-4 py-2 text-sm font-semibold text-primaria-contraste transition hover:opacity-90"
      >
        <Printer size={16} aria-hidden />
        Imprimir / Salvar PDF
      </button>
    </div>
  );
}
