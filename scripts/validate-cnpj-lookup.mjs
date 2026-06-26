/**
 * Valida consulta publica de CNPJ (APIs gratuitas).
 * Uso: npm run validate:cnpj-lookup [cnpj]
 */
const testCnpj = (process.argv[2] ?? "19131243000197").replace(/\D/g, "");

let ok = 0;
let fail = 0;

function pass(msg) {
  ok++;
  console.log(`  OK  ${msg}`);
}

function failMsg(msg) {
  fail++;
  console.log(`  FALHA  ${msg}`);
}

async function probe(name, url) {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AbelhaMel-ERP/1.0",
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (res.ok) {
      const data = await res.json();
      const razao = data.razao_social ?? data.estabelecimento?.nome_fantasia ?? "?";
      pass(`${name} HTTP ${res.status} — ${String(razao).slice(0, 40)}`);
      return data;
    }
    failMsg(`${name} HTTP ${res.status}`);
    return null;
  } catch (error) {
    failMsg(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function main() {
  console.log(`Validando consulta CNPJ: ${testCnpj}\n`);

  console.log("== Provedores ==");
  const publica = await probe("publica.cnpj.ws", `https://publica.cnpj.ws/cnpj/${testCnpj}`);
  const minha = await probe("minhareceita.org", `https://minhareceita.org/${testCnpj}`);
  await probe("brasilapi.com.br", `https://brasilapi.com.br/api/cnpj/v1/${testCnpj}`);

  console.log("\n== Campos uteis ==");
  if (publica?.estabelecimento) {
    const e = publica.estabelecimento;
    pass(`publica IBGE=${e.cidade?.ibge_id ?? "?"}`);
    pass(`publica situacao=${e.situacao_cadastral ?? "?"}`);
  } else {
    failMsg("publica.cnpj.ws sem estabelecimento");
  }

  if (minha) {
    pass(`minhareceita IBGE=${minha.codigo_municipio_ibge ?? "?"}`);
    pass(`minhareceita situacao=${minha.descricao_situacao_cadastral ?? "?"}`);
  }

  if (!publica && !minha) {
    failMsg("Nenhum provedor principal respondeu — consulta no painel vai falhar");
  }

  console.log(`\n== Resumo ==\nOK: ${ok} | Falhas: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
