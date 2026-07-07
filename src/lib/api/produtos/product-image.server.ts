import { NORFOOD_DEMO_TENANT_ID } from "@/lib/tenant/constants";
import { isUuid } from "@/lib/produtos/produtos-module";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);

function extFromMime(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

async function resolveTenantIdForUpload(userId: string, tenantSlug?: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { isTenantStaffRole } = await import("@/lib/tenant/tenant-permissions");
  type TenantRole = import("@/lib/tenant/types").TenantRole;

  async function assertMembership(tenantId: string) {
    const { data: membership } = await supabaseAdmin
      .from("tenant_users")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (membership && isTenantStaffRole(membership.role as TenantRole)) {
      return;
    }

    const { data: isStaff } = await supabaseAdmin.rpc("is_staff", { _user_id: userId });
    if (isStaff) return;

    throw new Error("Sem permissão para enviar fotos neste restaurante.");
  }

  if (tenantSlug?.trim()) {
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug.trim())
      .maybeSingle();
    if (!tenant?.id) throw new Error("Restaurante não encontrado.");
    await assertMembership(tenant.id);
    return tenant.id;
  }

  const { data: membership } = await supabaseAdmin
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membership?.tenant_id) return membership.tenant_id;
  return NORFOOD_DEMO_TENANT_ID;
}

export async function uploadProductImage(input: {
  userId: string;
  tenantId?: string;
  tenantSlug?: string | null;
  productId?: string | null;
  mimeType: string;
  base64: string;
}) {
  const mimeType = input.mimeType.trim().toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error("Formato não suportado. Use JPG, PNG ou WebP.");
  }

  const rawBase64 = input.base64.includes(",") ? input.base64.split(",").pop()! : input.base64;
  const buffer = Buffer.from(rawBase64, "base64");
  if (!buffer.byteLength) throw new Error("Arquivo de imagem vazio.");
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("Imagem muito grande. Tamanho máximo: 5 MB.");
  }

  const tenantId =
    input.tenantId ?? (await resolveTenantIdForUpload(input.userId, input.tenantSlug));
  const fileStem =
    input.productId && isUuid(input.productId) ? input.productId : crypto.randomUUID();
  const path = `${tenantId}/${fileStem}-${Date.now()}.${extFromMime(mimeType)}`;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.storage.from("product-images").upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(error.message || "Falha ao enviar imagem.");

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from("product-images").getPublicUrl(path);

  return publicUrl;
}
