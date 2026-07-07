import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveStaffTenantId } from "@/lib/api/auth/auth-helpers.server";
import {
  fetchProdutosModuleStore,
  saveProductRecord,
  saveProdutosModuleStore,
  type ProdutosModuleFetchResult,
} from "@/lib/api/produtos/produtos-module.server";
import { uploadProductImage } from "@/lib/api/produtos/product-image.server";
import type { ModuleStore, ProductCategory, ProductRecord } from "@/lib/produtos/produtos-module";

export const fetchProdutosModuleStoreServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }): Promise<ProdutosModuleFetchResult> => {
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    return fetchProdutosModuleStore(tenantId);
  });

export const saveProductRecordServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { tenantSlug: string; product: ProductRecord; categorias: ProductCategory[] }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    return saveProductRecord(data.product, data.categorias, tenantId);
  });

export const saveProdutosModuleStoreServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; store: ModuleStore }) => input)
  .handler(async ({ data, context }) => {
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    await saveProdutosModuleStore(data.store, tenantId);
    return { ok: true as const };
  });

export const uploadProductImageServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      tenantSlug?: string | null;
      productId?: string | null;
      mimeType: string;
      base64: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const url = await uploadProductImage({
      userId: context.userId,
      tenantId,
      productId: data.productId,
      mimeType: data.mimeType,
      base64: data.base64,
    });
    return { url };
  });
