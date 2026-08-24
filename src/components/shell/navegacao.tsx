"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  CalendarRange,
  ChartColumn,
  Calculator,
  Download,
  PiggyBank,
  Target,
  Tags,
  Users,
} from "lucide-react";

const ITENS = [
  { href: "/dashboard", rotulo: "Visão geral", Icone: LayoutDashboard, soAdmin: false },
  { href: "/transacoes", rotulo: "Transações", Icone: ArrowLeftRight, soAdmin: false },
  { href: "/relatorios", rotulo: "Relatórios", Icone: ChartColumn, soAdmin: false },
  { href: "/eventos", rotulo: "Eventos", Icone: CalendarRange, soAdmin: false },
  { href: "/cofrinho", rotulo: "Cofrinho", Icone: PiggyBank, soAdmin: false },
  { href: "/metas", rotulo: "Metas", Icone: Target, soAdmin: false },
  { href: "/categorias", rotulo: "Categorias", Icone: Tags, soAdmin: false },
  { href: "/exportar", rotulo: "Exportar", Icone: Download, soAdmin: false },
  { href: "/calculadora", rotulo: "Calculadora", Icone: Calculator, soAdmin: false },
  { href: "/usuarios", rotulo: "Usuários", Icone: Users, soAdmin: true },
] as const;

export function Navegacao({
  pendentes = 0,
  ehAdmin = false,
  emGaveta = false,
}: {
  pendentes?: number;
  ehAdmin?: boolean;
  /** Dentro da gaveta do celular, onde há largura para uma coluna só. */
  emGaveta?: boolean;
}) {
  const caminho = usePathname();

  return (
    <nav className={emGaveta ? "flex flex-col gap-0.5" : "flex flex-col gap-1"}>
      {ITENS.filter((item) => !item.soAdmin || ehAdmin).map(({ href, rotulo, Icone }) => {
        const ativo = caminho === href || caminho.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              ativo
                ? "bg-primaria text-primaria-contraste shadow-sm"
                : "text-texto-suave hover:bg-superficie-2 hover:text-texto"
            }`}
          >
            <Icone size={17} aria-hidden />
            <span>{rotulo}</span>
            {href === "/transacoes" && pendentes > 0 && (
              <span
                title={`${pendentes} transações sem categoria`}
                className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                  ativo ? "bg-white/20" : "bg-atencao/15 text-atencao"
                }`}
              >
                {pendentes}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
