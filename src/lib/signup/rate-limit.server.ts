import { createHash } from "node:crypto";

const MAX_ATTEMPTS_PER_IP_24H = 5;

function hashIp(ip: string) {
  return createHash("sha256").update(`norfood-signup:${ip}`).digest("hex");
}

export function extractClientIp(headers: Headers | Record<string, string | undefined>) {
  const get = (key: string) => {
    if (headers instanceof Headers) return headers.get(key) ?? undefined;
    return headers[key];
  };
  const forwarded = get("x-forwarded-for") ?? get("X-Forwarded-For");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return get("x-real-ip") ?? get("X-Real-Ip") ?? "unknown";
}

export async function assertSignupRateLimit(
  ip: string,
  email: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ipHash = hashIp(ip);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error: countError } = await supabaseAdmin
    .from("signup_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (countError) throw countError;

  if ((count ?? 0) >= MAX_ATTEMPTS_PER_IP_24H) {
    throw new Error("Muitas tentativas de cadastro deste endereço. Tente novamente amanhã.");
  }

  const { error: insertError } = await supabaseAdmin
    .from("signup_rate_limits")
    .insert({ ip_hash: ipHash, email: email.trim().toLowerCase() });
  if (insertError) throw insertError;
}
