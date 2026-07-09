import { base64ToArrayBuffer, resolveAvatarUrl, stripCacheBuster, withCacheBuster } from "../../lib/avatar";
import { readImageBase64 } from "../../lib/read-image-base64";
import { ENTREGADOR_PERFIS_TABLE } from "./constants";
import { getCurrentUser, requireSupabase } from "./supabase";
import { getActiveRiderTenantId, requireActiveTenantId } from "./tenant";

export async function updateRiderOnline(online: boolean) {
  const supabase = requireSupabase();
  const user = await getCurrentUser();
  const { error } = await supabase.from(ENTREGADOR_PERFIS_TABLE).upsert({
    user_id: user.id,
    tenant_id: getActiveRiderTenantId(),
    online,
  });
  if (error) throw error;

  await supabase
    .from("entregadores_localizacao")
    .update({ status: online ? "online" : "offline" })
    .eq("entregador_id", user.id);
}

export async function updateRiderProfile(payload: Record<string, unknown>) {
  const supabase = requireSupabase();
  const user = await getCurrentUser();
  const avatarOnly = Object.keys(payload).length === 1 && typeof payload.avatarUrl === "string";
  const cleanAvatarUrl =
    typeof payload.avatarUrl === "string" ? stripCacheBuster(payload.avatarUrl) : undefined;

  const profilePatch: Record<string, unknown> = {};
  if (typeof payload.name === "string") profilePatch.nome = payload.name;
  if (typeof payload.phone === "string") profilePatch.telefone = payload.phone;
  if (cleanAvatarUrl) profilePatch.avatar_url = cleanAvatarUrl;

  if (Object.keys(profilePatch).length) {
    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        ...profilePatch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw error;
  }

  const riderPatch: Record<string, unknown> = {};
  if (typeof payload.cep === "string") riderPatch.cep = payload.cep;
  if (typeof payload.address === "string") riderPatch.address = payload.address;
  if (typeof payload.neighborhood === "string") riderPatch.neighborhood = payload.neighborhood;
  if (typeof payload.city === "string") riderPatch.city = payload.city;
  if (typeof payload.state === "string") riderPatch.state = payload.state;
  if (typeof payload.email === "string") riderPatch.pix_key = payload.email;
  if (cleanAvatarUrl) riderPatch.avatar_url = cleanAvatarUrl;

  const settings = payload.settings as Record<string, unknown> | undefined;
  if (settings) {
    if (typeof settings.notifyNewOrders === "boolean")
      riderPatch.notify_new_orders = settings.notifyNewOrders;
    if (typeof settings.notifyOccurrences === "boolean")
      riderPatch.notify_occurrences = settings.notifyOccurrences;
    if (typeof settings.autoOnlineAfterLogin === "boolean")
      riderPatch.auto_online_after_login = settings.autoOnlineAfterLogin;
  }

  const activeTenantId = getActiveRiderTenantId();
  if (cleanAvatarUrl || Object.keys(riderPatch).length) {
    riderPatch.user_id = user.id;
    if (activeTenantId) riderPatch.tenant_id = activeTenantId;

    const { error: upsertError } = await supabase
      .from(ENTREGADOR_PERFIS_TABLE)
      .upsert(riderPatch, { onConflict: "user_id" });
    if (upsertError) throw upsertError;

    if (cleanAvatarUrl) {
      const { data: savedProfile, error: verifyError } = await supabase
        .from(ENTREGADOR_PERFIS_TABLE)
        .select("avatar_url")
        .eq("user_id", user.id)
        .maybeSingle<{ avatar_url: string | null }>();
      if (verifyError) throw verifyError;
      if (!savedProfile?.avatar_url) {
        const { error: updateError } = await supabase
          .from(ENTREGADOR_PERFIS_TABLE)
          .update({
            avatar_url: cleanAvatarUrl,
            tenant_id: activeTenantId,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);
        if (updateError) throw updateError;
      }
    }
  }

  if (avatarOnly) return;

  const updateUserPayload: {
    email?: string;
    data?: Record<string, unknown>;
  } = {
    data: {
      nome: typeof payload.name === "string" ? payload.name : user.user_metadata?.nome,
      telefone: typeof payload.phone === "string" ? payload.phone : user.user_metadata?.telefone,
    },
  };

  if (typeof payload.email === "string" && payload.email !== user.email) {
    updateUserPayload.email = payload.email;
  }

  const { error: authError } = await supabase.auth.updateUser(updateUserPayload);
  if (authError) throw authError;
}

export async function uploadRiderAvatar(
  localUri: string,
  base64Content?: string | null,
  mimeType = "image/jpeg",
) {
  const supabase = requireSupabase();
  const user = await getCurrentUser();
  requireActiveTenantId();

  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const path = `${user.id}/avatar.${ext}`;

  let uploadBody: ArrayBuffer;
  if (base64Content?.trim()) {
    uploadBody = base64ToArrayBuffer(base64Content);
  } else {
    uploadBody = base64ToArrayBuffer(await readImageBase64(localUri));
  }

  if (!uploadBody.byteLength) {
    throw new Error("A imagem selecionada esta vazia. Tente outra foto.");
  }

  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, uploadBody, {
    contentType: mimeType,
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  await updateRiderProfile({ avatarUrl: publicUrl });

  const { data: savedProfile, error: verifyError } = await supabase
    .from(ENTREGADOR_PERFIS_TABLE)
    .select("avatar_url")
    .eq("user_id", user.id)
    .maybeSingle<{ avatar_url: string | null }>();
  if (verifyError) throw verifyError;

  const persistedUrl = resolveAvatarUrl(savedProfile?.avatar_url, publicUrl);
  if (!persistedUrl) {
    throw new Error("A foto foi enviada, mas nao persistiu no perfil. Tente novamente.");
  }

  return withCacheBuster(persistedUrl);
}
