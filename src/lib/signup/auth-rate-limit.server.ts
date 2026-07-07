import { createHash } from "node:crypto";

const MAX_ATTEMPTS_PER_IP_1H = 30;
const WINDOW_MS = 60 * 60 * 1000;

function hashKey(parts: string[]) {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

export function maskAuthIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    const [local, domain] = trimmed.toLowerCase().split("@");
    if (!local || !domain) return "***@***";
    const visible = local.length <= 2 ? "*" : local.slice(0, 1);
    return `${visible}***@${domain}`;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 4) return `(**) *****-${digits.slice(-4)}`;
  return "(**) *****-****";
}

export async function assertAuthRateLimit(
  ip: string,
  action: string,
  identifier?: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ipHash = hashKey(["norfood-auth-ip", action, ip || "unknown"]);
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count, error: countError } = await supabaseAdmin
    .from("signup_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (countError) throw countError;

  if ((count ?? 0) >= MAX_ATTEMPTS_PER_IP_1H) {
    throw new Error("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
  }

  const emailKey = identifier
    ? `auth:${action}:${identifier.trim().toLowerCase().slice(0, 120)}`
    : `auth:${action}`;

  const { error: insertError } = await supabaseAdmin
    .from("signup_rate_limits")
    .insert({ ip_hash: ipHash, email: emailKey });
  if (insertError) throw insertError;
}
