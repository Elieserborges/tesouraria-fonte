"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ArrowLeftRight, Tags, Users } from "lucide-react";

const ITENS = [
  { href: "/dashboard", rotulo: "Visão geral", Icone: LayoutDashboard, soAdmin: false },
  { href: "/transacoes", rotulo: "Transações", Icone: ArrowLeftRight, soAdmin: false },
  { href: "/categorias", rotulo: "Categorias", Icone: Tags, soAdmin: false },
  { href: "/usuarios", rotulo: "Usuários", Icone: Users, soAdmin: true },
] as const;

export function Navegacao({
  pendentes = 0,
  ehAdmin = false,
}: {
  pendentes?: number;
  ehAdmin?: boolean;
}) {
  const caminho = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
      {ITENS.filter((item) => !item.soAdmin || ehAdmin).map(({ href, rotulo, Icone }) => {
        const ativo = caminho === href || caminho.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo ? "page" : undefined}
            className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition lg:flex-none ${
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
