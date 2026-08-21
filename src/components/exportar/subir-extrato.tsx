"use client";

import { useActionState, useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import { importarExtrato, type ResultadoImportacao } from "@/app/(app)/exportar/actions";

/**
 * A porta de entrada do extrato baixado no painel.
 *
 * O nome de quem paga por Pix não vem por API nenhuma — nem na de pagamentos,
 * nem no relatório automático, onde a coluna existe e chega vazia. O Mercado
 * Pago só revela no extrato que o dono da conta baixa.
 *
 * Uma vez por mês alguém arrasta o arquivo aqui e os nomes aparecem. Não é o
 * ideal, mas é honesto: o resto do sistema se virou sozinho, e este é o único
 * pedaço que depende de uma pessoa.
 */
export function SubirExtrato() {
  const [estado, enviar, enviando] = useActionState<ResultadoImportacao, FormData>(
    importarExtrato,
    {},
  );
  const [nomeDoArquivo, setNomeDoArquivo] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);

  return (
    <form action={enviar} className="cartao overflow-hidden">
      <header className="border-b border-borda px-5 py-4">
        <h2 className="text-sm font-semibold text-texto">Importar extrato</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-texto-suave">
          Traz o nome de quem pagou por Pix, que nenhuma API entrega. Baixe em{" "}
          <span className="text-texto">Mercado Pago → Relatórios → Extrato de conta</span>{" "}
          no formato CSV.
        </p>
      </header>

      <div className="p-5">
        {/*
          A área toda é clicável, não só o botão: arrastar um arquivo para um
          alvo pequeno é frustrante, e quem faz isso uma vez por mês não vai
          lembrar onde exatamente soltar.
        */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setSobre(true);
          }}
          onDragLeave={() => setSobre(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSobre(false);
            const arquivo = e.dataTransfer.files?.[0];
            if (!arquivo || !campo.current) return;
            const lista = new DataTransfer();
            lista.items.add(arquivo);
            campo.current.files = lista.files;
            setNomeDoArquivo(arquivo.name);
          }}
          onClick={() => campo.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            sobre
              ? "border-marca-400 bg-marca-400/5"
              : "border-borda hover:border-marca-400/60 hover:bg-superficie-2/50"
          }`}
        >
          <FileUp size={22} aria-hidden className="text-texto-suave" />
          <p className="text-sm text-texto">
            {nomeDoArquivo ?? "Arraste o CSV aqui ou clique para escolher"}
          </p>
          {!nomeDoArquivo && (
            <p className="text-xs text-texto-suave">
              Nada é apagado — o extrato só acrescenta e corrige.
            </p>
          )}
        </div>

        <input
          ref={campo}
          type="file"
          name="extrato"
          accept=".csv,text/csv"
          required
          onChange={(e) => setNomeDoArquivo(e.target.files?.[0]?.name ?? null)}
          className="sr-only"
        />

        <button
          type="submit"
          disabled={enviando || !nomeDoArquivo}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-marca-500 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {enviando ? (
            <>
              <Loader2 size={15} aria-hidden className="animate-spin" /> Lendo o extrato…
            </>
          ) : (
            <>
              <Upload size={15} aria-hidden /> Importar
            </>
          )}
        </button>

        {estado.erro && (
          <p role="alert" className="mt-3 rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">
            {estado.erro}
          </p>
        )}

        {estado.periodo && (
          <div className="mt-3 rounded-lg bg-verde-400/10 px-3 py-2.5 text-sm text-texto">
            <p className="flex items-center gap-1.5 font-medium text-entrada">
              <CheckCircle2 size={15} aria-hidden /> Extrato de {estado.periodo}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-texto-suave">
              <li>{estado.movimentos} movimentos lidos</li>
              <li>
                <strong className="text-texto">{estado.nomes}</strong> nomes preenchidos
              </li>
              {estado.valores ? <li>{estado.valores} valores corrigidos</li> : null}
              {estado.criados ? <li>{estado.criados} lançamentos criados</li> : null}
              <li>
                saldo do extrato no fim do período:{" "}
                {formatarMoeda(estado.saldoDoExtrato ?? 0)}
              </li>
            </ul>
          </div>
        )}
      </div>
    </form>
  );
}
