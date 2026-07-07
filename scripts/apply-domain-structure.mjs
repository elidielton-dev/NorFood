/**
 * Porta arquivos da estrutura plana (upstream) para subpastas por domínio.
 * Usado após merge do pull + stash da refatoração local.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const FILE_MOVES = {
  "src/lib/api/atendimento.functions.ts": "src/lib/api/atendimento/atendimento.functions.ts",
  "src/lib/api/auth-helpers.server.ts": "src/lib/api/auth/auth-helpers.server.ts",
  "src/lib/api/balcao.functions.ts": "src/lib/api/pedidos/balcao.functions.ts",
  "src/lib/api/delivery-panel.functions.ts": "src/lib/api/delivery/delivery-panel.functions.ts",
  "src/lib/api/integrations.functions.ts": "src/lib/api/tenant/integrations.functions.ts",
  "src/lib/api/mercado-pago.server.ts": "src/lib/api/financeiro/mercado-pago.server.ts",
  "src/lib/api/mesa-order.functions.ts": "src/lib/api/pedidos/mesa-order.functions.ts",
  "src/lib/api/mesas.functions.ts": "src/lib/api/pedidos/mesas.functions.ts",
  "src/lib/api/mesas-admin.functions.ts": "src/lib/api/pedidos/mesas-admin.functions.ts",
  "src/lib/api/omnichannel-order.functions.ts": "src/lib/api/pedidos/omnichannel-order.functions.ts",
  "src/lib/api/order-validation.server.ts": "src/lib/api/pedidos/order-validation.server.ts",
  "src/lib/api/orders.functions.ts": "src/lib/api/pedidos/orders.functions.ts",
  "src/lib/api/painel-data.functions.ts": "src/lib/api/tenant/painel-data.functions.ts",
  "src/lib/api/pedido-detalhe.server.ts": "src/lib/api/pedidos/pedido-detalhe.server.ts",
  "src/lib/api/platform-admin.functions.ts": "src/lib/api/plataforma/platform-admin.functions.ts",
  "src/lib/api/platform-billing.functions.ts": "src/lib/api/financeiro/platform-billing.functions.ts",
  "src/lib/api/platform-reseller.functions.ts": "src/lib/api/plataforma/platform-reseller.functions.ts",
  "src/lib/api/tenant-settings-admin.functions.ts": "src/lib/api/tenant/tenant-settings-admin.functions.ts",
  "src/lib/api/whatsapp-baileys.server.ts": "src/lib/api/atendimento/whatsapp-baileys.server.ts",
  "src/lib/api/whatsapp-evolution.server.ts": "src/lib/api/atendimento/whatsapp-evolution.server.ts",
  "src/lib/api/whatsapp-identity.server.ts": "src/lib/api/atendimento/whatsapp-identity.server.ts",
  "src/lib/api/whatsapp-store.server.ts": "src/lib/api/atendimento/whatsapp-store.server.ts",
  "src/lib/api/whatsapp.server.ts": "src/lib/api/atendimento/whatsapp.server.ts",
  "src/lib/whatsapp.ts": "src/lib/atendimento/whatsapp.ts",
  "src/lib/auth-roles.ts": "src/lib/auth/auth-roles.ts",
  "src/lib/db.ts": "src/lib/shared/db.ts",
  "src/lib/entregador-expo-go-url.ts": "src/lib/entregador/entregador-expo-go-url.ts",
  "src/lib/painel-configuracoes.tsx": "src/lib/painel/painel-configuracoes.tsx",
  "src/lib/painel-sidebar.ts": "src/lib/painel/painel-sidebar.ts",
  "src/lib/print.ts": "src/lib/shared/print.ts",
  "src/components/app-abelha-mel.tsx": "src/components/loja/app-abelha-mel.tsx",
  "src/components/entregador-expo-go-qr.tsx": "src/components/entregador/entregador-expo-go-qr.tsx",
  "src/components/gestao-ui.tsx": "src/components/painel/gestao-ui.tsx",
  "src/components/kds-order-detail-modal.tsx": "src/components/pedidos/kds-order-detail-modal.tsx",
};

const IMPORT_REWRITES = [
  [/(@\/lib\/api\/)atendimento\.functions/g, "$1atendimento/atendimento.functions"],
  [/(@\/lib\/api\/)auth-helpers\.server/g, "$1auth/auth-helpers.server"],
  [/(@\/lib\/api\/)balcao\.functions/g, "$1pedidos/balcao.functions"],
  [/(@\/lib\/api\/)delivery-panel\.functions/g, "$1delivery/delivery-panel.functions"],
  [/(@\/lib\/api\/)delivery-pricing\.functions/g, "$1delivery/delivery-pricing.functions"],
  [/(@\/lib\/api\/)integrations\.functions/g, "$1tenant/integrations.functions"],
  [/(@\/lib\/api\/)mercado-pago-panel\.functions/g, "$1financeiro/mercado-pago-panel.functions"],
  [/(@\/lib\/api\/)mercado-pago\.functions/g, "$1financeiro/mercado-pago.functions"],
  [/(@\/lib\/api\/)mercado-pago\.server/g, "$1financeiro/mercado-pago.server"],
  [/(@\/lib\/api\/)mesa-order\.functions/g, "$1pedidos/mesa-order.functions"],
  [/(@\/lib\/api\/)mesas-admin\.functions/g, "$1pedidos/mesas-admin.functions"],
  [/(@\/lib\/api\/)mesas\.functions/g, "$1pedidos/mesas.functions"],
  [/(@\/lib\/api\/)omnichannel-order\.functions/g, "$1pedidos/omnichannel-order.functions"],
  [/(@\/lib\/api\/)order-validation\.server/g, "$1pedidos/order-validation.server"],
  [/(@\/lib\/api\/)orders\.functions/g, "$1pedidos/orders.functions"],
  [/(@\/lib\/api\/)painel-data\.functions/g, "$1tenant/painel-data.functions"],
  [/(@\/lib\/api\/)pedido-detalhe\.functions/g, "$1pedidos/pedido-detalhe.functions"],
  [/(@\/lib\/api\/)pedido-detalhe\.server/g, "$1pedidos/pedido-detalhe.server"],
  [/(@\/lib\/api\/)platform-admin\.functions/g, "$1plataforma/platform-admin.functions"],
  [/(@\/lib\/api\/)platform-billing-signup\.server/g, "$1financeiro/platform-billing-signup.server"],
  [/(@\/lib\/api\/)platform-billing-mercadopago\.server/g, "$1financeiro/platform-billing-mercadopago.server"],
  [/(@\/lib\/api\/)platform-billing\.functions/g, "$1financeiro/platform-billing.functions"],
  [/(@\/lib\/api\/)platform-capacity\.functions/g, "$1plataforma/platform-capacity.functions"],
  [/(@\/lib\/api\/)platform-reseller\.functions/g, "$1plataforma/platform-reseller.functions"],
  [/(@\/lib\/api\/)tenant-settings-admin\.functions/g, "$1tenant/tenant-settings-admin.functions"],
  [/(@\/lib\/api\/)whatsapp-baileys\.server/g, "$1atendimento/whatsapp-baileys.server"],
  [/(@\/lib\/api\/)whatsapp-evolution\.server/g, "$1atendimento/whatsapp-evolution.server"],
  [/(@\/lib\/api\/)whatsapp-identity\.server/g, "$1atendimento/whatsapp-identity.server"],
  [/(@\/lib\/api\/)whatsapp-store\.server/g, "$1atendimento/whatsapp-store.server"],
  [/(@\/lib\/api\/)whatsapp\.functions/g, "$1atendimento/whatsapp.functions"],
  [/(@\/lib\/api\/)whatsapp\.server/g, "$1atendimento/whatsapp.server"],
  [/(@\/lib\/api\/)waba\.functions/g, "$1atendimento/waba.functions"],
  [/(@\/lib\/api\/)colaboradores\.functions/g, "$1tenant/colaboradores.functions"],
  [/(@\/lib\/api\/)coupons\.functions/g, "$1tenant/coupons.functions"],
  [/(@\/lib\/api\/)horarios\.functions/g, "$1tenant/horarios.functions"],
  [/(@\/lib\/api\/)horarios\.server/g, "$1tenant/horarios.server"],
  [/(@\/lib\/api\/)operational-config\.functions/g, "$1tenant/operational-config.functions"],
  [/(@\/lib\/api\/)tenant\.functions/g, "$1tenant/tenant.functions"],
  [/(@\/lib\/api\/)catalog-extras\.functions/g, "$1produtos/catalog-extras.functions"],
  [/(@\/lib\/api\/)produtos-module\.functions/g, "$1produtos/produtos-module.functions"],
  [/(@\/lib\/api\/)produtos-module\.server/g, "$1produtos/produtos-module.server"],
  [/(@\/lib\/api\/)product-image\.server/g, "$1produtos/product-image.server"],
  [/(@\/lib\/api\/)fiscal-certificate\.server/g, "$1fiscal/fiscal-certificate.server"],
  [/(@\/lib\/api\/)fiscal-sefaz\.server/g, "$1fiscal/fiscal-sefaz.server"],
  [/(@\/lib\/api\/)fiscal-store\.server/g, "$1fiscal/fiscal-store.server"],
  [/(@\/lib\/api\/)fiscal\.functions/g, "$1fiscal/fiscal.functions"],
  [/(@\/lib\/api\/)fiscal\.server/g, "$1fiscal/fiscal.server"],
  [/(@\/lib\/api\/)cnpj-lookup\.server/g, "$1fiscal/cnpj-lookup.server"],
  [/(@\/lib\/api\/)relatorios\.functions/g, "$1relatorios/relatorios.functions"],
  [/(@\/lib\/api\/)customer-auth\.functions/g, "$1auth/customer-auth.functions"],
  [/(@\/lib\/api\/)example\.functions/g, "$1plataforma/example.functions"],
  [/(@\/lib\/)whatsapp"/g, '$1atendimento/whatsapp"'],
  [/(@\/lib\/)auth-roles/g, "$1auth/auth-roles"],
  [/(@\/lib\/)auth-session/g, "$1auth/auth-session"],
  [/(@\/lib\/)login-redirect/g, "$1auth/login-redirect"],
  [/(@\/lib\/)customer-auth"/g, '$1auth/customer-auth"'],
  [/(@\/lib\/)db"/g, '$1shared/db"'],
  [/(@\/lib\/)utils"/g, '$1shared/utils"'],
  [/(@\/lib\/)runtime"/g, '$1shared/runtime"'],
  [/(@\/lib\/)city-config/g, "$1shared/city-config"],
  [/(@\/lib\/)config\.server/g, "$1shared/config.server"],
  [/(@\/lib\/)app-url/g, "$1shared/app-url"],
  [/(@\/lib\/)print"/g, '$1shared/print"'],
  [/(@\/lib\/)document-validation/g, "$1shared/document-validation"],
  [/(@\/lib\/)error-capture/g, "$1shared/error-capture"],
  [/(@\/lib\/)error-page/g, "$1shared/error-page"],
  [/(@\/lib\/)lovable-error-reporting/g, "$1shared/lovable-error-reporting"],
  [/(@\/lib\/)viacep/g, "$1shared/viacep"],
  [/(@\/lib\/)horarios"/g, '$1shared/horarios"'],
  [/(@\/lib\/)painel-configuracoes"/g, '$1painel/painel-configuracoes"'],
  [/(@\/lib\/)painel-sidebar/g, "$1painel/painel-sidebar"],
  [/(@\/lib\/)entregador-expo-go-url/g, "$1entregador/entregador-expo-go-url"],
  [/(@\/lib\/)cardapio"/g, '$1loja/cardapio"'],
  [/(@\/lib\/)carrinho"/g, '$1loja/carrinho"'],
  [/(@\/lib\/)colaboradores"/g, '$1colaboradores/colaboradores"'],
  [/(@\/lib\/)delivery-pricing/g, "$1delivery/delivery-pricing"],
  [/(@\/lib\/)delivery-tracking/g, "$1delivery/delivery-tracking"],
  [/(@\/lib\/)geocoding/g, "$1delivery/geocoding"],
  [/(@\/lib\/)order-display/g, "$1delivery/order-display"],
  [/(@\/lib\/)browser-geolocation/g, "$1shared/browser-geolocation"],
  [/(@\/lib\/)produtos-module"/g, '$1produtos/produtos-module"'],
  [/(@\/lib\/)produtos-sync/g, "$1produtos/produtos-sync"],
  [/(@\/lib\/)relatorios-inteligencia/g, "$1relatorios/relatorios-inteligencia"],
  [/(@\/lib\/)venda-detalhe/g, "$1pedidos/venda-detalhe"],
  [/(@\/lib\/)demo-credentials/g, "$1demo/demo-credentials"],
  [/(@\/lib\/)demo-store/g, "$1demo/demo-store"],
  [/(@\/lib\/)demo-sync-client/g, "$1demo/demo-sync-client"],
  [/(@\/components\/)app-abelha-mel/g, "$1loja/app-abelha-mel"],
  [/(@\/components\/)gestao-ui/g, "$1painel/gestao-ui"],
  [/(@\/components\/)painel-configuracoes-ui/g, "$1painel/painel-configuracoes-ui"],
  [/(@\/components\/)colaborador-form-modal/g, "$1colaboradores/colaborador-form-modal"],
  [/(@\/components\/)delivery-fleet-map-lazy/g, "$1delivery/delivery-fleet-map-lazy"],
  [/(@\/components\/)delivery-fleet-map"/g, '$1delivery/delivery-fleet-map"'],
  [/(@\/components\/)order-tracking-map-lazy/g, "$1delivery/order-tracking-map-lazy"],
  [/(@\/components\/)order-tracking-map"/g, '$1delivery/order-tracking-map"'],
  [/(@\/components\/)entregador-expo-go-qr/g, "$1entregador/entregador-expo-go-qr"],
  [/(@\/components\/)entregador-gate/g, "$1entregador/entregador-gate"],
  [/(@\/components\/)entregador-web-app/g, "$1entregador/entregador-web-app"],
  [/(@\/components\/)fiscal-ambiente-toggle/g, "$1fiscal/fiscal-ambiente-toggle"],
  [/(@\/components\/)fiscal-notas-panel/g, "$1fiscal/fiscal-notas-panel"],
  [/(@\/components\/)kds-order-detail-modal/g, "$1pedidos/kds-order-detail-modal"],
  [/(@\/components\/)venda-detalhe-modal/g, "$1pedidos/venda-detalhe-modal"],
  [/(@\/components\/)product-customizer-sheet/g, "$1loja/product-customizer-sheet"],
  [/(@\/components\/)product-form-modal/g, "$1loja/product-form-modal"],
  [/(@\/components\/)honey-background/g, "$1loja/honey-background"],
];

function rewriteImports(content) {
  let out = content;
  for (const [pattern, replacement] of IMPORT_REWRITES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function resolveConflictMarkers(content) {
  if (!content.includes("<<<<<<<")) return content;
  const blocks = content.split(/^<<<<<<< .+$/m);
  let result = blocks[0];
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const parts = block.split(/^=======\s*$/m);
    const upstream = parts[0] ?? "";
    const rest = parts[1] ?? "";
    const after = rest.split(/^>>>>>>> .+$/m);
    result += upstream + (after[1] ?? "");
  }
  return result;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walk(full, files);
    } else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

// 1. Move upstream flat files to domain folders
let moved = 0;
for (const [fromRel, toRel] of Object.entries(FILE_MOVES)) {
  const from = path.join(ROOT, fromRel);
  const to = path.join(ROOT, toRel);
  if (!fs.existsSync(from)) continue;
  ensureDir(to);
  const content = rewriteImports(fs.readFileSync(from, "utf8"));
  fs.writeFileSync(to, content);
  fs.unlinkSync(from);
  moved++;
  console.log(`moved: ${fromRel} -> ${toRel}`);
}
console.log(`\n${moved} arquivos movidos.\n`);

// 2. Rewrite imports + resolve conflict markers in all src files
let updated = 0;
for (const file of walk(path.join(ROOT, "src"))) {
  const original = fs.readFileSync(file, "utf8");
  let next = resolveConflictMarkers(original);
  next = rewriteImports(next);
  if (next !== original) {
    fs.writeFileSync(file, next);
    updated++;
  }
}

// 3. scripts/ folder too
for (const file of walk(path.join(ROOT, "scripts"))) {
  if (file.endsWith("apply-domain-structure.mjs")) continue;
  const original = fs.readFileSync(file, "utf8");
  const next = rewriteImports(original);
  if (next !== original) {
    fs.writeFileSync(file, next);
    updated++;
  }
}

console.log(`${updated} arquivos com imports/conflitos atualizados.`);
