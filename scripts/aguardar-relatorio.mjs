// Espera o relatório de Liberações ficar pronto e mostra o cabeçalho.
const t = process.env.MP_ACCESS_TOKEN_CONTA_1;
const H = { Authorization: `Bearer ${t}` };

for (let i = 0; i < 60; i++) {
  const r = await fetch("https://api.mercadopago.com/v1/account/release_report/list", { headers: H });
  const arquivos = await r.json();
  if (arquivos.length) {
    console.log(`PRONTO após ${i * 15}s:`, JSON.stringify(arquivos).slice(0, 400));
    const nome = arquivos[0].file_name;
    const d = await fetch(`https://api.mercadopago.com/v1/account/release_report/${nome}`, { headers: H });
    const csv = await d.text();
    const linhas = csv.split(/\r?\n/);
    console.log(`\n${nome}: ${csv.length} bytes, ${linhas.length} linhas\n`);
    console.log("CABEÇALHO:\n" + linhas[0]);
    console.log("\nAMOSTRA:");
    for (const l of linhas.slice(1, 8)) console.log(l.slice(0, 280));
    process.exit(0);
  }
  await new Promise((x) => setTimeout(x, 15000));
}
console.log("não ficou pronto em 15 minutos");
