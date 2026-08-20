"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { formatarData, formatarMes } from "@/lib/format";

/** Teto do intervalo personalizado. Acima disso, use Este ano ou Todo o período. */
export const MAX_DIAS_PERSONALIZADO = 92;

const CAMPO =
  "rounded-lg border border-borda bg-superficie px-2.5 py-1.5 text-sm text-texto outline-none focus:border-primaria focus:ring-2 focus:ring-primaria/25";

/** AAAA-MM-DD no fuso local — `toISOString` jogaria o dia para trás. */
function iso(d: Date) {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

const hoje = () => new Date();

function atalhos() {
  const h = hoje();
  const a = h.getFullYear();
  const m = h.getMonth();
  const menos = (dias: number) => {
    const d = new Date(h);
    d.setDate(d.getDate() - dias);
    return d;
  };

  return [
    { id: "este-mes", rotulo: "Este mês", de: new Date(a, m, 1), ate: new Date(a, m + 1, 0) },
    { id: "mes-passado", rotulo: "Mês passado", de: new Date(a, m - 1, 1), ate: new Date(a, m, 0) },
    { id: "30-dias", rotulo: "Últimos 30 dias", de: menos(29), ate: h },
    { id: "3-meses", rotulo: "Últimos 3 meses", de: menos(89), ate: h },
    { id: "este-ano", rotulo: "Este ano", de: new Date(a, 0, 1), ate: new Date(a, 11, 31) },
    { id: "ano-passado", rotulo: "Ano passado", de: new Date(a - 1, 0, 1), ate: new Date(a - 1, 11, 31) },
  ];
}

/** Nome curto do intervalo: mês fechado e ano fechado ganham rótulo próprio. */
export function rotuloPeriodo(de?: string, ate?: string, tudo?: boolean) {
  if (tudo || !de || !ate) return "Todo o período";

  const d1 = new Date(`${de}T12:00:00`);
  const d2 = new Date(`${ate}T12:00:00`);

  const mesInteiro =
    d1.getDate() === 1 &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear() &&
    d2.getDate() === new Date(d2.getFullYear(), d2.getMonth() + 1, 0).getDate();
  if (mesInteiro) return formatarMes(d1);

  const anoInteiro =
    d1.getDate() === 1 && d1.getMonth() === 0 && d2.getMonth() === 11 && d2.getDate() === 31 &&
    d1.getFullYear() === d2.getFullYear();
  if (anoInteiro) return String(d1.getFullYear());

  return `${formatarData(d1)} a ${formatarData(d2)}`;
}

export function SeletorPeriodo({
  de,
  ate,
  tudo,
}: {
  de?: string;
  ate?: string;
  tudo?: boolean;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();

  const [aberto, setAberto] = useState(false);
  const [personalizando, setPersonalizando] = useState(false);
  const [inicio, setInicio] = useState(de ?? "");
  const [fim, setFim] = useState(ate ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora — menu aberto por cima do conteúdo atrapalha mais
  // do que ajuda se não sair sozinho.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  function irPara(ajustes: Record<string, string | null>) {
    const proximos = new URLSearchParams(params.toString());
    for (const [chave, valor] of Object.entries(ajustes)) {
      if (valor === null) proximos.delete(chave);
      else proximos.set(chave, valor);
    }
    router.push(`${caminho}?${proximos.toString()}`);
    setAberto(false);
    setPersonalizando(false);
  }

  function aplicarPersonalizado() {
    setErro(null);
    if (!inicio || !fim) return setErro("Preencha as duas datas.");
    if (fim < inicio) return setErro("A data final não pode ser anterior à inicial.");

    const dias =
      Math.round(
        (new Date(`${fim}T00:00:00`).getTime() - new Date(`${inicio}T00:00:00`).getTime()) /
          86400000,
      ) + 1;
    if (dias > MAX_DIAS_PERSONALIZADO) {
      return setErro(
        `Máximo de 3 meses (${dias} dias selecionados). Para mais, use Este ano ou Todo o período.`,
      );
    }
    irPara({ de: inicio, ate: fim, periodo: null });
  }

  /** Passo de mês, só quando o intervalo atual é um mês fechado. */
  const ehMesFechado =
    !tudo && de && ate && rotuloPeriodo(de, ate) === formatarMes(new Date(`${de}T12:00:00`));

  function passoMes(passo: number) {
    if (!de) return;
    const base = new Date(`${de}T12:00:00`);
    const novo = new Date(base.getFullYear(), base.getMonth() + passo, 1);
    irPara({
      de: iso(novo),
      ate: iso(new Date(novo.getFullYear(), novo.getMonth() + 1, 0)),
      periodo: null,
    });
  }

  const atual = rotuloPeriodo(de, ate, tudo);
  const lista = atalhos();

  return (
    <div className="flex items-center gap-1" ref={caixa}>
      {ehMesFechado && (
        <button
          type="button"
          onClick={() => passoMes(-1)}
          aria-label="Mês anterior"
          className="grid size-9 place-items-center rounded-lg border border-borda text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
        >
          <ChevronLeft size={16} />
        </button>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-haspopup="menu"
          className="flex items-center gap-2 rounded-lg border border-borda bg-superficie px-3.5 py-2 text-sm font-medium capitalize text-texto transition hover:bg-superficie-2"
        >
          <CalendarRange size={15} aria-hidden className="text-texto-suave" />
          {atual}
          <ChevronDown size={15} aria-hidden className="text-texto-suave" />
        </button>

        {aberto && (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-xl border border-borda bg-superficie shadow-lg"
          >
            <ul className="py-1">
              {lista.map((o) => {
                const selecionado = !tudo && de === iso(o.de) && ate === iso(o.ate);
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => irPara({ de: iso(o.de), ate: iso(o.ate), periodo: null })}
                      className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-texto transition hover:bg-superficie-2"
                    >
                      {o.rotulo}
                      {selecionado && <Check size={14} className="text-primaria" />}
                    </button>
                  </li>
                );
              })}

              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => irPara({ periodo: "tudo", de: null, ate: null })}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-texto transition hover:bg-superficie-2"
                >
                  Todo o período
                  {tudo && <Check size={14} className="text-primaria" />}
                </button>
              </li>
            </ul>

            <div className="border-t border-borda">
              {personalizando ? (
                <div className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={inicio}
                      onChange={(e) => setInicio(e.target.value)}
                      aria-label="Data inicial"
                      className={`${CAMPO} w-full`}
                    />
                    <span className="text-xs text-texto-suave">até</span>
                    <input
                      type="date"
                      value={fim}
                      onChange={(e) => setFim(e.target.value)}
                      aria-label="Data final"
                      className={`${CAMPO} w-full`}
                    />
                  </div>
                  {erro ? (
                    <p role="alert" className="text-xs text-alerta">
                      {erro}
                    </p>
                  ) : (
                    <p className="text-xs text-texto-suave">Máximo de 3 meses.</p>
                  )}
                  <button
                    type="button"
                    onClick={aplicarPersonalizado}
                    className="w-full rounded-lg bg-primaria px-3 py-2 text-sm font-semibold text-primaria-contraste transition hover:opacity-90"
                  >
                    Aplicar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setPersonalizando(true)}
                  className="w-full px-4 py-2.5 text-left text-sm font-medium text-primaria transition hover:bg-superficie-2"
                >
                  Personalizar…
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {ehMesFechado && (
        <button
          type="button"
          onClick={() => passoMes(1)}
          aria-label="Próximo mês"
          className="grid size-9 place-items-center rounded-lg border border-borda text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
