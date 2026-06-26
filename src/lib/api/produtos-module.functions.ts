import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId } from "@/lib/api/auth-helpers.server";
import {
  fetchProdutosModuleStore,
  saveProdutosModuleStore,
  type ProdutosModuleFetchResult,
} from "@/lib/api/produtos-module.server";
import type { ModuleStore } from "@/lib/produtos-module";

export const fetchProdutosModuleStoreServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProdutosModuleFetchResult> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao módulo de produtos.");
    return fetchProdutosModuleStore();
  });

export const saveProdutosModuleStoreServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { store: ModuleStore }) => input)
  .handler(async ({ data, context }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao módulo de produtos.");
    await saveProdutosModuleStore(data.store);
    return { ok: true as const };
  });
