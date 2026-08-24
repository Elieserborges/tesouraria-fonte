"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, FileText, SlidersHorizontal } from "lucide-react";
import { recorteParaUrl, SECAO_LABEL, SECOES, type Secao } from "@/lib/exportacao";

/**
 * Monta um recorte do relatório para entregar a alguém específico.
 *
 * O caso que pediu isso: dar ao diretor do Face a Face as contas do evento
 * dele, sem as demais movimentações da igreja. Escolher categorias resolve o
 * conteúdo; escolher seções resolve o formato, porque um relatório de evento
 * não precisa de cofrinho nem de formas de pagamento.
 *
 * O recorte vira URL, então o link pode ser guardado e reaberto no mês
 * seguinte sem remontar nada.
 */
export function ExportacaoPersonalizada({
  categorias,
  consulta,
}: {
  categorias: string[];
  /** O período já escolhido na página, no formato de query string. */
  consulta: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [secoes, setSecoes] = useState<Secao[]>([...SECOES]);

  const alternar = <T,>(lista: T[], item: T): T[] =>
    lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item];

  const url = useMemo(() => {
    const recorte = recorteParaUrl({ categorias: escolhidas, secoes });
    return [consulta, recorte].filter(Boolean).join("&");
  }, [consulta, escolhidas, secoes]);

  const nada = secoes.length === 0;

  return (
    <section className="cartao overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2.5 px-5 py-4 text-left transition-colors hover:bg-superficie-2/50"
      >
        <SlidersHorizontal size={15} aria-hidden className="text-texto-suave" />
        <span className="flex-1">
          <span className="block text-sm font-semibold text-texto">
            Exportação personalizada
          </span>
          <span className="block text-xs text-texto-suave">
            {escolhidas.length === 0
              ? "Recorte o documento para entregar a alguém específico"
              : `${escolhidas.join(", ")} · ${secoes.length} de ${SECOES.length} blocos`}
          </span>
        </span>
        <span aria-hidden className="text-xs text-texto-suave">
          {aberto ? "fechar" : "abrir"}
        </span>
      </button>

      {aberto && (
        <div className="space-y-5 border-t border-borda p-5">
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-texto">
                1. Quais lançamentos entram
              </h3>
              {escolhidas.length > 0 && (
                <button
                  type="button"
                  onClick={() => setEscolhidas([])}
                  className="text-xs text-texto-suave underline underline-offset-2 hover:text-texto"
                >
                  limpar
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categorias.map((c) => {
                const marcada = escolhidas.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEscolhidas((atuais) => alternar(atuais, c))}
                    aria-pressed={marcada}
                    className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                      marcada
                        ? "bg-marca-500 text-white"
                        : "bg-superficie-2 text-texto-suave hover:text-texto"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-texto-suave">
              Nenhuma marcada exporta todas. Com alguma marcada, só as
              transações dessas categorias entram — e o documento avisa que é
              parcial, escondendo o saldo da conta, que não diria respeito ao
              recorte.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-texto">
              2. Quais blocos o documento terá
            </h3>
            <p className="mb-2 mt-0.5 text-xs text-texto-suave">
              Desmarque o que não interessa a quem vai receber.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SECOES.map((s) => {
                const marcada = secoes.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSecoes((atuais) => alternar(atuais, s))}
                    aria-pressed={marcada}
                    className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                      marcada
                        ? "bg-marca-500 text-white"
                        : "bg-superficie-2 text-texto-suave hover:text-texto"
                    }`}
                  >
                    {SECAO_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {nada ? (
              <p className="text-sm text-alerta">
                Marque ao menos uma seção para o documento ter conteúdo.
              </p>
            ) : (
              <>
                <Link
                  href={`/exportar/imprimir?${url}`}
                  target="_blank"
                  className="inline-flex items-center gap-2 rounded-lg bg-marca-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  <FileText size={15} aria-hidden /> Abrir o documento
                </Link>
                <a
                  href={`/api/exportar/transacoes?${url}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-borda px-4 py-2 text-sm text-texto transition-colors hover:bg-superficie-2"
                >
                  <Download size={15} aria-hidden /> Baixar a planilha
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
