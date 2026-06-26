/**
 * Valida tabelas, configuracao e prontidao SEFAZ do modulo fiscal.
 * Uso: npm run validate:fiscal
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.PUBLIC_APP_URL ?? "https://abelhaemel.vercel.app";

function loadEnvFile() {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile();

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let ok = 0;
let fail = 0;
let warn = 0;

function pass(msg) {
  ok++;
  console.log(`  OK  ${msg}`);
}

function failMsg(msg) {
  fail++;
  console.log(`  FALHA  ${msg}`);
}

function warnMsg(msg) {
  warn++;
  console.log(`  AVISO  ${msg}`);
}

function maskCnpj(cnpj) {
  const d = String(cnpj ?? "").replace(/\D/g, "");
  if (d.length !== 14) return "(incompleto)";
  return `**.***.***/****-${d.slice(-2)}`;
}

async function checkRoutes() {
  console.log("\n== Rotas HTTP ==");
  for (const path of ["/painel/fiscal", "/painel/fiscal/configuracoes", "/painel/produtos"]) {
    try {
      const res = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
      if (res.status === 200 || res.status === 307 || res.status === 302) pass(`${path} (${res.status})`);
      else failMsg(`${path} HTTP ${res.status}`);
    } catch (error) {
      failMsg(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function checkSchema(sb) {
  console.log("\n== Supabase (schema) ==");

  for (const table of ["empresa_fiscal", "fiscal_config", "notas_fiscais"]) {
    const { error } = await sb.from(table).select("id").limit(1);
    if (error) failMsg(`tabela ${table}: ${error.message}`);
    else pass(`tabela ${table}`);
  }

  for (const col of ["ncm", "cfop", "csosn"]) {
    const { error } = await sb.from("produtos").select(col).limit(1);
    if (error) failMsg(`produtos.${col}: ${error.message}`);
    else pass(`produtos.${col}`);
  }

  const { error: xmlColError } = await sb.from("notas_fiscais").select("xml_autorizado").limit(1);
  if (xmlColError) failMsg(`notas_fiscais.xml_autorizado: ${xmlColError.message}`);
  else pass("notas_fiscais.xml_autorizado");
}

async function checkReadiness(sb) {
  console.log("\n== Prontidao SEFAZ (dados cadastrados) ==");

  const encryptionKey = Boolean(process.env.ENCRYPTION_KEY?.trim());
  if (encryptionKey) pass("ENCRYPTION_KEY configurada no ambiente local");
  else warnMsg("ENCRYPTION_KEY ausente no .env local (verifique na Vercel)");

  const { data: empresa, error: empresaError } = await sb
    .from("empresa_fiscal")
    .select(
      "cnpj, razao_social, inscricao_estadual, logradouro, numero, bairro, codigo_municipio_ibge, municipio, uf, cep, email",
    )
    .eq("id", "default")
    .maybeSingle();
  if (empresaError) {
    failMsg(`empresa_fiscal: ${empresaError.message}`);
    return;
  }

  const empresaChecks = [
    ["CNPJ", /^\d{14}$/.test(String(empresa?.cnpj ?? "").replace(/\D/g, ""))],
    ["Razao social", Boolean(empresa?.razao_social?.trim())],
    ["Inscricao estadual", Boolean(empresa?.inscricao_estadual?.trim())],
    ["Endereco completo", Boolean(empresa?.logradouro?.trim() && empresa?.numero?.trim() && empresa?.bairro?.trim())],
    ["IBGE municipio (7 digitos)", /^\d{7}$/.test(String(empresa?.codigo_municipio_ibge ?? "").replace(/\D/g, ""))],
    ["Municipio/UF", Boolean(empresa?.municipio?.trim() && empresa?.uf?.trim())],
    ["CEP", String(empresa?.cep ?? "").replace(/\D/g, "").length === 8],
    ["E-mail", Boolean(empresa?.email?.trim())],
  ];

  for (const [label, valid] of empresaChecks) {
    if (valid) pass(`Empresa — ${label}`);
    else failMsg(`Empresa — ${label} pendente`);
  }

  const { data: config, error: configError } = await sb
    .from("fiscal_config")
    .select(
      "nfce_habilitada, ambiente, serie_nfce, proximo_numero_nfce, csc_id, csc_token_encrypted, certificado_pfx_encrypted, certificado_senha_encrypted, certificado_valido_ate, certificado_titular, certificado_cnpj, emitir_automatico_pdv, emitir_automatico_delivery, emitir_automatico_mesas, provider",
    )
    .eq("id", "default")
    .maybeSingle();
  if (configError) {
    failMsg(`fiscal_config: ${configError.message}`);
    return;
  }

  if (config?.provider === "sefaz") pass("Provider = sefaz (direto)");
  else failMsg(`Provider = ${config?.provider ?? "?"} (esperado: sefaz)`);

  if (config?.nfce_habilitada) pass("NFC-e habilitada");
  else failMsg("NFC-e desabilitada");

  pass(`Ambiente SEFAZ: ${config?.ambiente === "producao" ? "producao" : "homologacao"}`);

  if (config?.csc_id?.trim()) pass(`CSC ID configurado (${config.csc_id.trim()})`);
  else failMsg("CSC ID nao configurado");

  if (config?.csc_token_encrypted) pass("CSC token salvo (criptografado)");
  else failMsg("CSC token nao configurado");

  const certInstalado = Boolean(
    config?.certificado_pfx_encrypted && config?.certificado_senha_encrypted,
  );
  if (certInstalado) {
    const validoAte = config?.certificado_valido_ate
      ? new Date(config.certificado_valido_ate).getTime()
      : 0;
    const dias = validoAte
      ? Math.ceil((validoAte - Date.now()) / (24 * 60 * 60 * 1000))
      : null;
    if (validoAte > Date.now()) {
      pass(`Certificado A1 instalado (valido por ${dias} dia(s))`);
    } else if (validoAte) {
      failMsg("Certificado A1 vencido");
    } else {
      pass("Certificado A1 instalado");
    }
    if (config?.certificado_titular) pass(`Titular: ${config.certificado_titular}`);
    if (config?.certificado_cnpj) {
      const certCnpj = String(config.certificado_cnpj).replace(/\D/g, "");
      const empCnpj = String(empresa?.cnpj ?? "").replace(/\D/g, "");
      if (certCnpj && empCnpj && certCnpj === empCnpj) {
        pass(`CNPJ certificado = empresa (${maskCnpj(certCnpj)})`);
      } else if (certCnpj && empCnpj) {
        failMsg(
          `CNPJ certificado (${maskCnpj(certCnpj)}) diferente da empresa (${maskCnpj(empCnpj)})`,
        );
      }
    }
  } else {
    failMsg("Certificado A1 nao instalado");
  }

  const { count: notasCount } = await sb
    .from("notas_fiscais")
    .select("*", { count: "exact", head: true });
  const { count: autorizadas } = await sb
    .from("notas_fiscais")
    .select("*", { count: "exact", head: true })
    .in("status", ["autorizada", "autorizada_homologacao"]);
  pass(`Notas emitidas: ${notasCount ?? 0} (${autorizadas ?? 0} autorizadas)`);

  const { count: prodTotal } = await sb
    .from("produtos")
    .select("*", { count: "exact", head: true });
  const { count: prodNcm } = await sb
    .from("produtos")
    .select("*", { count: "exact", head: true })
    .not("ncm", "is", null)
    .neq("ncm", "");
  if ((prodTotal ?? 0) === 0) warnMsg("Nenhum produto cadastrado");
  else if ((prodNcm ?? 0) === (prodTotal ?? 0)) pass(`Produtos com NCM: ${prodNcm}/${prodTotal}`);
  else failMsg(`Produtos com NCM: ${prodNcm ?? 0}/${prodTotal ?? 0} (obrigatorio para emitir)`);

  console.log("\n== Emissao automatica ==");
  const autos = [
    ["PDV/Balcao", config?.emitir_automatico_pdv],
    ["Delivery", config?.emitir_automatico_delivery],
    ["Mesas", config?.emitir_automatico_mesas],
  ];
  for (const [label, enabled] of autos) {
    if (enabled) pass(`${label}: ligado`);
    else warnMsg(`${label}: desligado`);
  }
  warnMsg("PDV/Balcao ainda nao dispara auto-emissao no codigo (so delivery entregue e mesa finalizada)");

  const empresaOk = empresaChecks.every(([, valid]) => valid);
  const sefazPronto =
    empresaOk &&
    certInstalado &&
    Boolean(config?.csc_id?.trim()) &&
    Boolean(config?.csc_token_encrypted) &&
    config?.nfce_habilitada &&
    config?.provider === "sefaz";

  console.log("\n== Veredito ==");
  if (sefazPronto) {
    pass("Integracao SEFAZ PRONTA para teste/emissao (falta apenas emitir nota de homologacao)");
  } else {
    failMsg("Integracao SEFAZ ainda NAO esta 100% pronta — veja pendencias acima");
  }
}

async function main() {
  console.log(`Validando fiscal em ${baseUrl}`);
  await checkRoutes();

  if (!supabaseUrl || !serviceKey) {
    failMsg("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes (.env / Vercel)");
    console.log(`\n== Resumo ==\nOK: ${ok} | Avisos: ${warn} | Falhas: ${fail}`);
    process.exit(1);
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await checkSchema(sb);
  await checkReadiness(sb);

  console.log(`\n== Resumo ==\nOK: ${ok} | Avisos: ${warn} | Falhas: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
