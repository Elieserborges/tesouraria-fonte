import type { Metadata } from "next";
import { Fita } from "@/components/calculadora/fita";
import { Taxa, type OpcaoDeTaxa } from "@/components/calculadora/taxa";
import { listarTransacoes } from "@/lib/dados";
import { contaNoSaldo, FORMA_LABEL, type FormaPagamento } from "@/lib/types";

export const metadata: Metadata = { title: "Calculadora · Fluxx Finance" };

/** Abaixo disso a média não diz nada — é ruído de meia dúzia de casos. */
const MINIMO_PARA_MEDIA = 10;

/**
 * As duas contas que a tesouraria faz fora do sistema.
 *
 * Somar uma pilha de valores e descobrir quanto sobra depois da tarifa eram
 * coisas que se faziam na calculadora do celular, com o resultado copiado à
 * mão. Trazer para cá evita o erro de digitação no meio do caminho.
 */
export default async function PaginaCalculadora() {
  /*
   * As taxas saem do histórico, não de um número decorado.
   *
   * Cada forma de pagamento cobra o seu, e a diferença é grande: o Pix
   * recebido direto não cobra nada, o link de pagamento cobra quase 3%. Uma
   * média única entre elas levaria a decisão errada na hora de definir o
   * preço de um ingresso.
   */
  const transacoes = await listarTransacoes({ limite: 20000 });

  const porForma = new Map<string, { tarifas: number; brutos: number; n: number }>();
  for (const t of transacoes) {
    if (t.tipo !== "entrada" || !contaNoSaldo(t.status) || !t.forma) continue;
    const bruto = Number(t.valor_bruto ?? 0);
    if (bruto <= 0) continue;

    const acumulado = porForma.get(t.forma) ?? { tarifas: 0, brutos: 0, n: 0 };
    acumulado.tarifas += Number(t.tarifa ?? 0);
    acumulado.brutos += bruto;
    acumulado.n += 1;
    porForma.set(t.forma, acumulado);
  }

  const opcoes: OpcaoDeTaxa[] = [...porForma.entries()]
    .filter(([forma, v]) => v.n >= MINIMO_PARA_MEDIA && forma !== "cofrinho")
    .map(([forma, v]) => ({
      forma,
      rotulo: FORMA_LABEL[forma as FormaPagamento] ?? forma,
      taxa: Number(((v.tarifas / v.brutos) * 100).toFixed(2)),
      recebimentos: v.n,
    }))
    // Da mais cara para a mais barata: é a ordem em que a pergunta aparece.
    .sort((a, b) => b.taxa - a.taxa);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-texto">Calculadora</h1>
        <p className="text-sm text-texto-suave">
          Para conferir dinheiro sem sair do sistema. Nada aqui é salvo.
        </p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Fita />
        <div className="space-y-3">
          {opcoes.length > 0 ? (
            <>
              <Taxa opcoes={opcoes} />
              <p className="px-1 text-xs leading-relaxed text-texto-suave">
                As taxas são a média real desta conta, não a tabela do Mercado Pago.
                Dá para digitar outra se estiver simulando.
              </p>
            </>
          ) : (
            <p className="cartao px-5 py-10 text-center text-sm text-texto-suave">
              Ainda não há recebimentos suficientes para calcular as taxas da conta.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
