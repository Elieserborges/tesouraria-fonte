"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatarMoeda, formatarMoedaCompacta } from "@/lib/format";
import type { PontoFluxo } from "@/lib/dados";

export function GraficoFluxo({ dados }: { dados: PontoFluxo[] }) {
  const vazio = dados.every((d) => d.entradas === 0 && d.saidas === 0);

  if (vazio) {
    return (
      <div className="grid h-72 place-items-center text-sm text-texto-suave">
        Nenhuma movimentação registrada neste período.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--borda)"
          />
          <XAxis
            dataKey="rotulo"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--texto-suave)", fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fill: "var(--texto-suave)", fontSize: 11 }}
            tickFormatter={(v: number) => formatarMoedaCompacta(v)}
          />
          <Tooltip
            cursor={{ fill: "var(--superficie-2)" }}
            contentStyle={{
              background: "var(--superficie)",
              border: "1px solid var(--borda)",
              borderRadius: 12,
              color: "var(--texto)",
              fontSize: 12,
            }}
            labelFormatter={(rotulo) => `Dia ${rotulo}`}
            formatter={(valor, nome) => [formatarMoeda(Number(valor)), nome]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: "var(--texto-suave)" }}
          />
          <Bar
            dataKey="entradas"
            name="Entradas"
            fill="var(--color-verde-400)"
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            dataKey="saidas"
            name="Saídas"
            fill="var(--color-alerta)"
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
