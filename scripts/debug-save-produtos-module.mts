import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env", "deploy/.env"]) {
  try {
    for (const line of readFileSync(resolve(root, file), "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i === -1) continue;
      const key = trimmed.slice(0, i).trim();
      let value = trimmed.slice(i + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore missing env file
  }
}

import { saveProdutosModuleStore } from "../src/lib/api/produtos-module.server.ts";
import { blankProduct, createId, type ModuleStore } from "../src/lib/produtos-module.ts";

const tenantId = process.env.TENANT_ID ?? "af4aff3d-d85e-4c90-bbf5-fa94f7daf6ec";

const store: ModuleStore = {
  produtos: [
    {
      ...blankProduct(),
      id: createId("prod"),
      nome: "Pipoca Doce Especial DEBUG",
      categoria: "Bolos",
      precoVenda: 18,
      variacoes: [
        {
          id: createId("var"),
          nome: "",
          preco: 18,
          estoque: 10,
          tempoPreparo: 10,
          status: "ativo",
        },
      ],
    },
  ],
  categorias: [
    {
      id: "cat-bolos",
      nome: "Bolos",
      descricao: "",
      icone: "🎂",
      ordem: 1,
      status: "ativo",
    },
  ],
  gruposAdicionais: [],
  adicionais: [],
  promocoes: [],
  movimentos: [],
  vendasSimuladas: [],
};

try {
  await saveProdutosModuleStore(store, tenantId);
  console.log("SAVE OK");
} catch (error) {
  console.error("SAVE FAIL:", error instanceof Error ? error.message : error);
  process.exit(1);
}
