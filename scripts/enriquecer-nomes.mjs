// Preenche o nome de quem pagou/recebeu usando o extrato em PDF.
//
//   npm run enriquecer -- ../extratos            # simula
//   npm run enriquecer -- ../extratos --gravar
//
// A API de pagamentos devolve o pagador mascarado ("XXXXXXXXXXX"), mas o
// extrato traz o nome por extenso ("Pix recebido DAIANE KOENIG MENDES").
// Como os ids são os mesmos, dá para casar e completar o que falta.

import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const args = process.argv.slice(2);
const GRAVAR = args.includes("--gravar");
const pasta = args.find((a) => !a.startsWith("--")) ?? "../extratos";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const LINHA =
  /^(\d{2}-\d{2}-\d{4})\s+(.*?)\s*(\d{8,})\s+R\$\s*(-?[\d.]+,\d{2})\s+R\$\s*(-?[\d.]+,\d{2})/;

// Prefixos que descrevem a operação, não a pessoa.
const PREFIXOS = [
  "Pagamento com Código QR Pix",
  "Pagamento com Código QR",
  "Pix recebido",
  "Pix enviado",
  "Liberação de dinheiro",
  "Dinheiro reservado",
  "Dinheiro retirado",
  "Pagamento de",
  "Transferência",
];

/** Extrai o nome da pessoa da descrição do extrato, se houver. */
function nomeDe(descricao) {
  let texto = descricao;
  for (const p of PREFIXOS) {
    const i = texto.indexOf(p);
    if (i !== -1) texto = texto.slice(i + p.length);
  }
  // Tira CPF/CNPJ e sobras numéricas.
  texto = texto.replace(/\d{5,}/g, " ").replace(/\s+/g, " ").trim();
  // Um nome tem ao menos duas palavras e nada de valores.
  if (texto.length < 5 || texto.split(" ").length < 2) return null;
  if (/R\$|Saldo|Descrição/i.test(texto)) return null;
  return texto.slice(0, 80);
}

const arquivos = readdirSync(pasta).filter((f) => f.toLowerCase().endsWith(".pdf"));
const nomes = new Map();

for (const f of arquivos) {
  const pdf = await getDocument({
    data: new Uint8Array(readFileSync(`${pasta}/${f}`)),
    useSystemFonts: true,
  }).promise;

  for (let p = 1; p <= pdf.numPages; p++) {
    const conteudo = await (await pdf.getPage(p)).getTextContent();
    const porY = new Map();
    for (const item of conteudo.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!porY.has(y)) porY.set(y, []);
      porY.get(y).push({ x: item.transform[4], s: item.str });
    }

    const linhas = [...porY.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, itens]) => itens.sort((a, b) => a.x - b.x).map((i) => i.s).join(" "));

    for (let i = 0; i < linhas.length; i++) {
      const m = linhas[i].match(LINHA);
      if (!m) continue;
      const vizinhas = [linhas[i - 1], linhas[i + 1]]
        .filter((l) => l && !LINHA.test(l) && !/Data\s+Descrição|^\d+\/\d+$/.test(l))
        .join(" ");
      const nome = nomeDe(`${m[2]} ${vizinhas}`.replace(/\s+/g, " ").trim());
      if (nome) nomes.set(m[3], nome);
    }
  }
}

console.log(`nomes encontrados no extrato: ${nomes.size}`);

const alvo = [];
for (let de = 0; ; de += 1000) {
  const { data } = await admin
    .from("transacoes")
    .select("id, mp_payment_id, contraparte")
    .range(de, de + 999);
  if (!data?.length) break;
  for (const t of data) {
    if (!t.mp_payment_id) continue;
    const nome = nomes.get(t.mp_payment_id);
    if (!nome) continue;
    // Só completa o que está vazio ou mascarado pela API.
    const atual = (t.contraparte ?? "").trim();
    if (atual && !/^X+$/i.test(atual)) continue;
    alvo.push({ id: t.id, nome });
  }
  if (data.length < 1000) break;
}

console.log(`transações a completar: ${alvo.length}`);
for (const a of alvo.slice(0, 8)) console.log(`   ${a.nome}`);

if (!GRAVAR) {
  console.log("\nSimulação. Rode com --gravar para aplicar.");
  process.exit(0);
}

let feitas = 0;
for (const a of alvo) {
  const { error } = await admin
    .from("transacoes")
    .update({ contraparte: a.nome })
    .eq("id", a.id);
  if (error) { console.error(`✗ ${a.id}: ${error.message}`); process.exit(1); }
  feitas++;
}
console.log(`\n✓ ${feitas} transação(ões) com o nome preenchido`);
