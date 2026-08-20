import { formatarData, formatarMes } from "@/lib/format";

/**
 * Cálculo de período, usado pela página (servidor) e pelo seletor (cliente).
 *
 * Mora aqui, e não no componente, porque exports de um arquivo "use client"
 * viram referência de cliente: chamar um deles no servidor lança erro em
 * tempo de execução, e o build não avisa.
 */

/** Teto do intervalo personalizado. Acima disso, use Este ano ou Todo o período. */
export const MAX_DIAS_PERSONALIZADO = 92;

/** AAAA-MM-DD no fuso local — `toISOString` jogaria o dia para trás. */
export function iso(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Primeiro e último dia do mês corrente. */
export function mesCorrente(referencia = new Date()) {
  const a = referencia.getFullYear();
  const m = referencia.getMonth();
  return { de: iso(new Date(a, m, 1)), ate: iso(new Date(a, m + 1, 0)) };
}

/** Nome curto do intervalo: mês fechado e ano fechado ganham rótulo próprio. */
export function rotuloPeriodo(de?: string, ate?: string, tudo?: boolean): string {
  if (tudo || !de || !ate) return "Todo o período";

  const d1 = new Date(`${de}T12:00:00`);
  const d2 = new Date(`${ate}T12:00:00`);

  const ultimoDia = new Date(d2.getFullYear(), d2.getMonth() + 1, 0).getDate();
  const mesInteiro =
    d1.getDate() === 1 &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear() &&
    d2.getDate() === ultimoDia;
  if (mesInteiro) return formatarMes(d1);

  const anoInteiro =
    d1.getDate() === 1 &&
    d1.getMonth() === 0 &&
    d2.getMonth() === 11 &&
    d2.getDate() === 31 &&
    d1.getFullYear() === d2.getFullYear();
  if (anoInteiro) return String(d1.getFullYear());

  return `${formatarData(d1)} a ${formatarData(d2)}`;
}

/** Atalhos oferecidos no menu — pensados para tesouraria: mês e ano. */
export function atalhosDePeriodo(referencia = new Date()) {
  const a = referencia.getFullYear();
  const m = referencia.getMonth();
  const menos = (dias: number) => {
    const d = new Date(referencia);
    d.setDate(d.getDate() - dias);
    return d;
  };

  return [
    { id: "este-mes", rotulo: "Este mês", de: new Date(a, m, 1), ate: new Date(a, m + 1, 0) },
    { id: "mes-passado", rotulo: "Mês passado", de: new Date(a, m - 1, 1), ate: new Date(a, m, 0) },
    { id: "30-dias", rotulo: "Últimos 30 dias", de: menos(29), ate: referencia },
    { id: "3-meses", rotulo: "Últimos 3 meses", de: menos(89), ate: referencia },
    { id: "este-ano", rotulo: "Este ano", de: new Date(a, 0, 1), ate: new Date(a, 11, 31) },
    {
      id: "ano-passado",
      rotulo: "Ano passado",
      de: new Date(a - 1, 0, 1),
      ate: new Date(a - 1, 11, 31),
    },
  ];
}
