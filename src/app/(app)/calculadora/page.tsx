import type { Metadata } from "next";
import { Fita } from "@/components/calculadora/fita";
import { Taxa, type OpcaoDeTaxa } from "@/components/calculadora/taxa";
import { taxasObservadas } from "@/lib/dados";

export const metadata: Metadata = { title: "Calculadora · Fluxx Finance" };

/** Abaixo disso a média não diz nada — é ruído de meia dúzia de casos. */
const MINIMO_PARA_MEDIA = 10;

/*
 * Nome de cada combinação de forma e meio de pagamento.
 *
 * "Checkout / bank_transfer" é o Pix pago pelo link de pagamento, que cobra
 * tarifa — diferente do Pix feito direto na chave, que não cobra nada. Chamar
 * os dois de "Pix" faria a pessoa escolher o preço errado, então o rótulo diz
 * por onde o dinheiro entrou.
 */
const ROTULOS: Record<string, string> = {
  "pix:bank_transfer": "Pix na chave",
  "qr_presencial:bank_transfer": "QR no culto",
  "qr_presencial:account_money": "QR no culto (saldo)",
  "checkout:bank_transfer": "Link — Pix",
  "checkout:credit_card": "Link — crédito",
  "checkout:debit_card": "Link — débito",
  "checkout:account_money": "Link — saldo MP",
  "maquininha:debit_card": "Maquininha — débito",
  "maquininha:credit_card": "Maquininha — crédito",
  "maquininha:prepaid_card": "Maquininha — pré-pago",
};

/**
 * As duas contas que a tesouraria faz fora do sistema.
 *
 * Somar uma pilha de valores e descobrir quanto sobra depois da tarifa eram
 * coisas que se faziam na calculadora do celular, com o resultado copiado à
 * mão. Trazer para cá evita o erro de digitação no meio do caminho.
 */
export default async function PaginaCalculadora() {
  const observadas = await taxasObservadas();

  const opcoes: OpcaoDeTaxa[] = observadas
    .filter((o) => o.recebimentos >= MINIMO_PARA_MEDIA && ROTULOS[o.chave])
    .map((o) => ({
      chave: o.chave,
      rotulo: ROTULOS[o.chave],
      taxa: o.taxa,
      recebimentos: o.recebimentos,
      bruto: o.bruto,
    }))
    // Da mais cara para a mais barata: a pergunta costuma ser "quanto perco".
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
                Cada linha é a média real desta conta, não a tabela do Mercado Pago.
                Repare que o Pix feito direto na chave não cobra nada, mas o mesmo
                Pix pago pelo link tem tarifa — é a mesma forma de pagar por
                caminhos diferentes.
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
