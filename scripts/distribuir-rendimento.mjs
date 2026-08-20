/*
 * Espalha o rendimento do cofrinho pelos meses em que ele rendeu.
 *
 * O Mercado Pago informa só o acumulado ("rendeu R$ 214,27 nos últimos 9
 * meses"), sem abrir mês a mês. Lançar tudo de uma vez faz o mês do
 * lançamento parecer ter recebido uma receita que levou nove meses para
 * existir — e foi exatamente o que aconteceu com agosto.
 *
 * Dividir por igual não é exato, mas é honesto: nenhum mês fica com uma
 * receita que não teve, e o total continua certo. O ajuste dos centavos
 * cai no último mês.
 *
 *   node --env-file=.env.local scripts/distribuir-rendimento.mjs
 *   node --env-file=.env.local scripts/distribuir-rendimento.mjs --gravar
 */
import { createClient } from "@supabase/supabase-js";

const gravar = process.argv.includes("--gravar");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: conta } = await admin
  .from("contas")
  .select("id")
  .eq("slug", "cofrinho")
  .single();

// O lançamento único que precisa ser desmembrado.
const { data: unico } = await admin
  .from("transacoes")
  .select("id, valor, ocorrido_em")
  .eq("mp_payment_id", "rendimento-cofrinho")
  .maybeSingle();

if (!unico) {
  console.log("o lançamento único não está lá — nada a fazer.");
  process.exit(0);
}

// Os meses em que houve dinheiro no cofrinho.
const movimentos = [];
for (let de = 0; ; de += 1000) {
  const { data } = await admin
    .from("transacoes")
    .select("ocorrido_em")
    .eq("conta_id", conta.id)
    .neq("mp_payment_id", "rendimento-cofrinho")
    .order("ocorrido_em", { ascending: true })
    .range(de, de + 999);
  if (!data || data.length === 0) break;
  movimentos.push(...data);
  if (data.length < 1000) break;
}

const primeiro = movimentos[0].ocorrido_em.slice(0, 7);
const ultimo = new Date().toISOString().slice(0, 7);

const meses = [];
for (let d = new Date(`${primeiro}-01T12:00:00Z`); d.toISOString().slice(0, 7) <= ultimo; ) {
  meses.push(d.toISOString().slice(0, 7));
  d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12));
}

const total = Number(unico.valor);
const porMes = Math.floor((total / meses.length) * 100) / 100;
const sobra = Number((total - porMes * meses.length).toFixed(2));

console.log(`rendimento total: ${total.toFixed(2)}`);
console.log(`meses com cofrinho: ${meses.length} (${meses[0]} a ${meses[meses.length - 1]})`);
console.log(`por mês: ${porMes.toFixed(2)}   sobra no último: ${sobra.toFixed(2)}`);

const linhas = meses.map((mes, i) => {
  // Último dia do mês, que é quando o rendimento é creditado. No mês
  // corrente ele ainda não fechou, então vale hoje — datar no futuro faria
  // o lançamento sumir dos filtros de período, que param em hoje.
  const [ano, m] = mes.split("-").map(Number);
  const fimDoMes = new Date(Date.UTC(ano, m, 0, 15, 0, 0));
  const agora = new Date();
  const fim = fimDoMes > agora ? agora : fimDoMes;
  return {
    conta_id: conta.id,
    tipo: "entrada",
    valor: i === meses.length - 1 ? Number((porMes + sobra).toFixed(2)) : porMes,
    valor_bruto: i === meses.length - 1 ? Number((porMes + sobra).toFixed(2)) : porMes,
    tarifa: 0,
    descricao: "Rendimento do cofrinho",
    observacao: "Rendeu dentro do cofrinho, sem passar pela conta corrente. O Mercado Pago informa só o acumulado; este valor é a média dos meses.",
    status: "approved",
    ocorrido_em: fim.toISOString(),
    origem: "mercadopago",
    mp_payment_id: `rendimento-cofrinho-${mes}`,
  };
});

console.log("\nvai ficar assim:");
for (const l of linhas) console.log(`  ${l.ocorrido_em.slice(0, 10)}  ${l.valor.toFixed(2).padStart(7)}`);
console.log(`  soma: ${linhas.reduce((s, l) => s + l.valor, 0).toFixed(2)}`);

if (!gravar) {
  console.log("\n(simulação — rode com --gravar para aplicar)");
  process.exit(0);
}

const { error } = await admin
  .from("transacoes")
  .upsert(linhas, { onConflict: "mp_payment_id" });
if (error) throw new Error(error.message);

await admin.from("transacoes").delete().eq("id", unico.id);
console.log(`\n${linhas.length} lançamentos mensais criados, o lançamento único removido`);

const { data: saldos } = await admin.from("saldo_por_conta").select("conta_nome, saldo");
for (const s of saldos ?? []) console.log(`  ${s.conta_nome.padEnd(26)} ${Number(s.saldo).toFixed(2).padStart(10)}`);
