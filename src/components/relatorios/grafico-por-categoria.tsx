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
import type { ResumoCategoria } from "@/lib/dados";

export function GraficoPorCategoria({ dados }: { dados: ResumoCategoria[] }) {
  if (dados.length === 0) {
    return (
      <div className="grid h-64 place-items-center text-sm text-texto-suave">
        Nenhuma movimentação categorizada neste período.
      </div>
    );
  }

  // Barras horizontais: nome de categoria é longo e não cabe no eixo de baixo.
  const altura = Math.max(240, dados.length * 44 + 60);

  return (
    <div style={{ height: altura }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dados}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--borda)" />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--texto-suave)", fontSize: 11 }}
            tickFormatter={(v: number) => formatarMoedaCompacta(v)}
          />
          <YAxis
            type="category"
            dataKey="nome"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--texto)", fontSize: 12 }}
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
            formatter={(valor, nome) => [formatarMoeda(Number(valor)), nome]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: "var(--texto-suave)" }}
          />
          <Bar dataKey="entradas" name="Entradas" fill="var(--color-verde-400)" radius={[0, 4, 4, 0]} maxBarSize={16} />
          <Bar dataKey="saidas" name="Saídas" fill="var(--color-alerta)" radius={[0, 4, 4, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
