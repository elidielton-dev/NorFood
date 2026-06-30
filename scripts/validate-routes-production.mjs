#!/usr/bin/env node
/**
 * Validação ponta a ponta: rotas HTTP, redirects e links por empresa.
 * Uso: node scripts/validate-routes-production.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.PRODUCTION_URL ?? "https://norfood.com.br").replace(/\/$/, "");

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[trimmed.slice(0, eq).trim()] = value;
    }
  } catch {
    /* optional */
  }
  return env;
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, "deploy/.env")) };
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_APP_URL = (env.PUBLIC_APP_URL ?? BASE).replace(/\/$/, "");

const passed = [];
const failed = [];
const warnings = [];

function ok(section, name, detail = "") {
  passed.push({ section, name, detail });
  console.log(`  OK   [${section}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(section, name, detail = "") {
  failed.push({ section, name, detail });
  console.error(`  FAIL [${section}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function warn(section, name, detail = "") {
  warnings.push({ section, name, detail });
  console.log(`  WARN [${section}] ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Fetch sem seguir redirect — retorna status e Location. */
async function fetchNoFollow(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }
  return { url, status: res.status, location, body, ok: res.ok };
}

/** Fetch seguindo redirects — URL final. */
async function fetchFollow(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "follow" });
  return { status: res.status, finalUrl: res.url, body: await res.text() };
}

function isHomeRedirect(location) {
  if (!location) return false;
  const normalized = location.replace(BASE, "").replace(/\/$/, "") || "/";
  return normalized === "/" || normalized === "";
}

async function checkStaticRoutes() {
  console.log("\n== 1. Rotas estáticas ==");

  const must200 = [
    "/api/health",
    "/",
    "/login",
    "/cadastro",
    "/recuperar-senha",
    "/selecionar-empresa",
    "/auth/callback?next=%2Fcadastro%3Fresume%3D1",
    "/login?redirect=%2Ft%2Fnorfood%2Fdashboard",
    "/login?redirect=%2Fadmin",
    "/loja/norfood",
    "/t/norfood/dashboard",
    "/admin",
    "/entregador",
  ];

  for (const path of must200) {
    const r = await fetchNoFollow(path);
    if (r.status >= 200 && r.status < 400) {
      ok("STATIC", path, `HTTP ${r.status}`);
    } else if (r.status >= 300 && r.status < 400) {
      fail("STATIC", path, `redirect inesperado ${r.status} → ${r.location}`);
    } else {
      fail("STATIC", path, `HTTP ${r.status}`);
    }
  }

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  if (health?.ok) ok("STATIC", "/api/health JSON", health.service);
  else fail("STATIC", "/api/health JSON", JSON.stringify(health));
}

async function checkBadRedirects() {
  console.log("\n== 2. Redirects indesejados (não deve ir para /) ==");

  const { data: tenants, error } = await admin
    .from("tenants")
    .select("id, slug, name, status")
    .order("created_at", { ascending: false });

  if (error) throw error;

  for (const tenant of tenants ?? []) {
    const lojaPath = `/loja/${tenant.slug}`;
    const r = await fetchNoFollow(lojaPath);

    if (r.status >= 300 && r.status < 400 && isHomeRedirect(r.location)) {
      fail("REDIRECT", lojaPath, `${r.status} → ${r.location} (empresa ${tenant.status})`);
      continue;
    }

    if (r.status >= 200 && r.status < 400) {
      ok("REDIRECT", lojaPath, `HTTP ${r.status} (${tenant.status})`);
    } else {
      warn("REDIRECT", lojaPath, `HTTP ${r.status} location=${r.location}`);
    }

    const painelPath = `/t/${tenant.slug}/dashboard`;
    const pr = await fetchNoFollow(painelPath);

    if (pr.status >= 300 && pr.status < 400) {
      const dest = pr.location.replace(BASE, "");
      if (dest.startsWith("/login")) {
        ok("REDIRECT", painelPath, `→ login (esperado sem sessão)`);
      } else if (isHomeRedirect(pr.location)) {
        fail("REDIRECT", painelPath, `${pr.status} → ${pr.location}`);
      } else {
        ok("REDIRECT", painelPath, `→ ${dest}`);
      }
    } else if (pr.status === 200) {
      ok("REDIRECT", painelPath, "HTTP 200 (público/demo?)");
    }
  }

  return tenants ?? [];
}

async function checkTenantLinks(tenants) {
  console.log("\n== 3. Links por empresa (loja, painel, status) ==");

  for (const tenant of tenants) {
    const links = [
      { label: "loja", path: `/loja/${tenant.slug}` },
      { label: "painel", path: `/t/${tenant.slug}/dashboard` },
      { label: "aguardando", path: `/cadastro/aguardando/${tenant.slug}` },
      { label: "conta-suspensa", path: `/conta-suspensa/${tenant.slug}` },
    ];

    for (const { label, path } of links) {
      const r = await fetchFollow(path);
      const finalPath = new URL(r.finalUrl).pathname;

      if (label === "loja" && finalPath === "/") {
        fail("TENANT", `${tenant.slug}/${label}`, `caiu na home — ${path}`);
        continue;
      }

      if (r.status >= 200 && r.status < 400) {
        ok("TENANT", `${tenant.slug}/${label}`, `→ ${finalPath}`);
      } else {
        fail("TENANT", `${tenant.slug}/${label}`, `HTTP ${r.status}`);
      }
    }

    const emailPainel = `${PUBLIC_APP_URL}/t/${tenant.slug}/dashboard`;
    const emailLoja = `${PUBLIC_APP_URL}/loja/${tenant.slug}`;
    const emailSuspensa = `${PUBLIC_APP_URL}/conta-suspensa/${tenant.slug}`;

    if (!emailPainel.startsWith(PUBLIC_APP_URL)) {
      fail("EMAIL-LINK", tenant.slug, "link painel inválido");
    } else {
      ok("EMAIL-LINK", `${tenant.slug} painel`, emailPainel);
    }
    ok("EMAIL-LINK", `${tenant.slug} loja`, emailLoja);
    ok("EMAIL-LINK", `${tenant.slug} suspensa`, emailSuspensa);
  }
}

async function checkTenantOwners(tenants) {
  console.log("\n== 4. Proprietários e vínculos ==");

  for (const tenant of tenants) {
    const { data: owners, error } = await admin
      .from("tenant_users")
      .select("user_id, role, status")
      .eq("tenant_id", tenant.id)
      .eq("role", "owner")
      .eq("status", "active");

    if (error) {
      fail("OWNER", tenant.slug, error.message);
      continue;
    }

    if (!owners?.length) {
      warn("OWNER", tenant.slug, `sem owner ativo (status=${tenant.status})`);
      continue;
    }

    for (const row of owners) {
      const { data: userData } = await admin.auth.admin.getUserById(row.user_id);
      const email = userData.user?.email;
      if (email) {
        ok("OWNER", tenant.slug, email);
      } else {
        warn("OWNER", tenant.slug, `user ${row.user_id} sem e-mail`);
      }
    }

    const loginRedirect = `/login?redirect=${encodeURIComponent(`/t/${tenant.slug}/dashboard`)}`;
    const lr = await fetchNoFollow(loginRedirect);
    if (lr.status >= 200 && lr.status < 400) {
      ok("LOGIN-LINK", tenant.slug, loginRedirect);
    } else {
      fail("LOGIN-LINK", tenant.slug, `HTTP ${lr.status}`);
    }
  }
}

async function checkSuspendedPending(tenants) {
  console.log("\n== 5. Status especiais (pending / suspended) ==");

  for (const tenant of tenants.filter((t) => t.status === "pending" || t.status === "suspended")) {
    if (tenant.status === "pending") {
      const r = await fetchFollow(`/cadastro/aguardando/${tenant.slug}`);
      const path = new URL(r.finalUrl).pathname;
      if (path.includes("aguardando")) ok("STATUS", `${tenant.slug} pending`, path);
      else warn("STATUS", `${tenant.slug} pending`, `final=${path}`);
    }

    if (tenant.status === "suspended") {
      const r = await fetchFollow(`/conta-suspensa/${tenant.slug}`);
      const path = new URL(r.finalUrl).pathname;
      if (path.includes("conta-suspensa") || path.includes("suspens")) {
        ok("STATUS", `${tenant.slug} suspended`, path);
      } else if (path === "/") {
        fail("STATUS", `${tenant.slug} suspended`, "caiu na home");
      } else {
        warn("STATUS", `${tenant.slug} suspended`, `final=${path}`);
      }
    }
  }
}

let admin;

async function main() {
  console.log("=== Validação rotas + empresas NorFood ===");
  console.log(`Site: ${BASE}`);
  console.log(`PUBLIC_APP_URL: ${PUBLIC_APP_URL}`);

  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("Faltam SUPABASE_URL ou SERVICE_ROLE em deploy/.env");
  }

  admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { count, error: countErr } = await admin
    .from("tenants")
    .select("id", { count: "exact", head: true });
  if (countErr) throw countErr;
  console.log(`Empresas no banco: ${count ?? 0}`);

  await checkStaticRoutes();
  const tenants = await checkBadRedirects();
  await checkTenantLinks(tenants);
  await checkTenantOwners(tenants);
  await checkSuspendedPending(tenants);

  console.log("\n========================================");
  console.log("RESUMO");
  console.log("========================================");
  console.log(`OK:    ${passed.length}`);
  console.log(`FAIL:  ${failed.length}`);
  console.log(`WARN:  ${warnings.length}`);

  if (failed.length) {
    console.log("\n--- FALHAS ---");
    for (const f of failed) {
      console.log(`  • [${f.section}] ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
    }
    process.exit(1);
  }

  if (warnings.length) {
    console.log("\n--- AVISOS ---");
    for (const w of warnings) {
      console.log(`  • [${w.section}] ${w.name}${w.detail ? `: ${w.detail}` : ""}`);
    }
  }

  console.log("\nValidação concluída com sucesso.");
}

main().catch((err) => {
  console.error("\nValidação abortada:", err?.message ?? err);
  process.exit(1);
});
