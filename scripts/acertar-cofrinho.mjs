/*
 * Acerta o rendimento do cofrinho pelo saldo que o Mercado Pago mostra.
 *
 * O rendimento do cofrinho é o único dinheiro da igreja que nenhuma API
 * reporta: ele nasce lá dentro e nunca passa pela conta corrente, então não
 * aparece em pagamento nem em extrato. O que dá para fazer é o contrário —
 * as movimentações são conhecidas ao centavo, então o rendimento é o que
 * falta para chegar no saldo que o aplicativo mostra.
 *
 * O rótulo "rendeu R$ X nos últimos N meses" do aplicativo não serve: é uma
 * janela móvel, não o acumulado. Foi confiar nele que deixou R$ 0,22 de
 * diferença na primeira vez.
 *
 * Rode de vez em quando (uma vez por mês basta) com o valor que aparece na
 * aba Cofrinhos:
 *
 *   node --env-file=.env.local scripts/acertar-cofrinho.mjs 4112,17
 *   node --env-file=.env.local scripts/acertar-cofrinho.mjs 4112,17 --gravar
 */
import { createClient } from "@supabase/supabase-js";

const informado = process.argv[2];
const gravar = process.argv.includes("--gravar");

if (!informado) {
  console.error("informe o saldo do cofrinho, como aparece no aplicativo:");
  console.error("  node --env-file=.env.local scripts/acertar-cofrinho.mjs 4112,17");
  process.exit(1);
}

const alvo = Number(informado.replace(/\./g, "").replace(",", "."));
if (!Number.isFinite(alvo)) {
  console.error(`não entendi "${informado}" como um valor.`);
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: conta } = await admin
  .from("contas")
  .select("id, nome")
  .eq("slug", "cofrinho")
  .single();

const linhas = [];
for (let de = 0; ; de += 1000) {
  const { data } = await admin
    .from("transacoes")
    .select("id, valor, tipo, status, ocorrido_em, descricao, mp_payment_id")
    .eq("conta_id", conta.id)
    .in("status", ["approved", "authorized"])
    .order("ocorrido_em", { ascending: true })
    .range(de, de + 999);
  if (!data || data.length === 0) break;
  linhas.push(...data);
  if (data.length < 1000) break;
}

const rendimentos = linhas.filter((l) =>
  String(l.mp_payment_id ?? "").startsWith("rendimento-cofrinho"),
);
const movimentos = linhas.filter(
  (l) => !String(l.mp_payment_id ?? "").startsWith("rendimento-cofrinho"),
);

const guardado = movimentos.reduce(
  (s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)),
  0,
);
const rendimentoAtual = rendimentos.reduce((s, l) => s + Number(l.valor), 0);
const rendimentoCerto = Number((alvo - guardado).toFixed(2));
const ajuste = Number((rendimentoCerto - rendimentoAtual).toFixed(2));

console.log(`saldo informado:      ${alvo.toFixed(2).padStart(10)}`);
console.log(`movimentações:        ${guardado.toFixed(2).padStart(10)}   (conferidas contra o extrato)`);
console.log(`rendimento lançado:   ${rendimentoAtual.toFixed(2).padStart(10)}`);
console.log(`rendimento correto:   ${rendimentoCerto.toFixed(2).padStart(10)}`);
console.log(`ajuste necessário:    ${ajuste.toFixed(2).padStart(10)}`);

if (Math.abs(ajuste) < 0.005) {
  console.log("\njá está certo — nada a fazer.");
  process.exit(0);
}

// O ajuste vai no rendimento mais recente: é lá que a diferença nasceu, e
// mexer nos meses antigos mudaria relatórios que já foram apresentados.
const ultimo = rendimentos[rendimentos.length - 1];

if (!ultimo) {
  console.error("\nnão há lançamento de rendimento para ajustar.");
  process.exit(1);
}

const valorNovo = Number((Number(ultimo.valor) + ajuste).toFixed(2));
console.log(
  `\nvai ajustar o rendimento de ${ultimo.ocorrido_em.slice(0, 10)}: ` +
    `${Number(ultimo.valor).toFixed(2)} -> ${valorNovo.toFixed(2)}`,
);

if (valorNovo < 0) {
  console.error("o ajuste deixaria o lançamento negativo — confira o valor informado.");
  process.exit(1);
}

if (!gravar) {
  console.log("\n(simulação — rode com --gravar para aplicar)");
  process.exit(0);
}

const { error } = await admin
  .from("transacoes")
  .update({
    valor: valorNovo,
    valor_bruto: valorNovo,
    observacao:
      "Rendeu dentro do cofrinho, sem passar pela conta corrente. Ajustado " +
      "pelo saldo do aplicativo: nenhuma API informa este valor.",
  })
  .eq("id", ultimo.id);

if (error) throw new Error(error.message);

const { data: saldos } = await admin
  .from("saldo_por_conta")
  .select("conta_nome, saldo");
console.log("\nsaldos:");
for (const s of saldos ?? []) {
  console.log(`  ${s.conta_nome.padEnd(26)} ${Number(s.saldo).toFixed(2).padStart(10)}`);
}
