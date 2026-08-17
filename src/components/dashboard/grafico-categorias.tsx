"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatarMoeda } from "@/lib/format";
import type { FatiaCategoria } from "@/lib/dados";

export function GraficoCategorias({ dados }: { dados: FatiaCategoria[] }) {
  const total = dados.reduce((soma, d) => soma + d.valor, 0);

  if (!total) {
    return (
      <div className="grid h-72 place-items-center text-sm text-texto-suave">
        Nenhuma saída registrada neste período.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="h-56 w-full sm:w-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dados}
              dataKey="valor"
              nameKey="nome"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="var(--superficie)"
              strokeWidth={2}
            >
              {dados.map((fatia) => (
                <Cell key={fatia.nome} fill={fatia.cor} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--superficie)",
                border: "1px solid var(--borda)",
                borderRadius: 12,
                color: "var(--texto)",
                fontSize: 12,
              }}
              formatter={(valor, nome) => [formatarMoeda(Number(valor)), nome]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex-1 space-y-2">
        {dados.slice(0, 7).map((fatia) => (
          <li key={fatia.nome} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: fatia.cor }}
            />
            <span className="min-w-0 flex-1 truncate text-texto">{fatia.nome}</span>
            <span className="tabular-nums text-texto-suave">
              {((fatia.valor / total) * 100).toFixed(0)}%
            </span>
            <span className="w-28 text-right font-medium tabular-nums text-texto">
              {formatarMoeda(fatia.valor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
