#!/usr/bin/env node
/**
 * Lista ou cria domínios no Resend.
 * Uso:
 *   node scripts/resend-domains.mjs list
 *   node scripts/resend-domains.mjs create contato.norfood.com.br
 *   node scripts/resend-domains.mjs verify <domain-id>
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function loadKey() {
  try {
    const { injectDeployEnv } = await import("./load-deploy-env.mjs");
    injectDeployEnv();
  } catch {
    // ignore
  }
  const key = process.env.RESEND_API_KEY?.trim();
  if (key) return key;

  for (const rel of ["deploy/.env", ".env"]) {
    try {
      const text = readFileSync(resolve(root, rel), "utf8");
      const match = text.match(/^RESEND_API_KEY=(.+)$/m);
      if (match?.[1]) return match[1].trim().replace(/^["']|["']$/g, "");
    } catch {
      // ignore
    }
  }
  throw new Error("RESEND_API_KEY não encontrada.");
}

async function resend(path, options = {}) {
  const key = await loadKey();
  const response = await fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body)}`);
  }
  return body;
}

const [command, arg] = process.argv.slice(2);

if (command === "list") {
  const body = await resend("/domains");
  const domains = body?.data ?? [];
  if (!domains.length) {
    console.log("Nenhum domínio cadastrado no Resend.");
    process.exit(0);
  }
  for (const domain of domains) {
    console.log(`- ${domain.name} | id=${domain.id} | status=${domain.status}`);
  }
} else if (command === "create") {
  const name = arg?.trim();
  if (!name) throw new Error("Informe o domínio. Ex.: node scripts/resend-domains.mjs create contato.norfood.com.br");
  const body = await resend("/domains", {
    method: "POST",
    body: JSON.stringify({ name, region: "sa-east-1" }),
  });
  console.log("Domínio criado:");
  console.log(JSON.stringify(body, null, 2));
  console.log("\nAdicione os registros DNS acima no provedor do domínio norfood.com.br e depois rode:");
  console.log(`node scripts/resend-domains.mjs verify ${body.id}`);
} else if (command === "verify") {
  const id = arg?.trim();
  if (!id) throw new Error("Informe o id do domínio.");
  const body = await resend(`/domains/${id}/verify`, { method: "POST" });
  console.log(JSON.stringify(body, null, 2));
} else {
  console.log(`Uso:
  node scripts/resend-domains.mjs list
  node scripts/resend-domains.mjs create contato.norfood.com.br
  node scripts/resend-domains.mjs verify <domain-id>`);
  process.exit(1);
}
