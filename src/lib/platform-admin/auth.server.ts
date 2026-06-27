import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isPlatformAdminEmail } from "@/lib/platform-admin/emails";

export function isServerDemoAdminMode(): boolean {
  if (process.env.VITE_DEMO_MODE === "true") return true;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  return false;
}

export async function getUserEmail(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email.toLowerCase();
}

function parseServerPlatformAdminEmails(): string[] {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? process.env.VITE_PLATFORM_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getSupabasePublishableKey(): string {
  return process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
}

export function isPlatformAdminEmailOnServer(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase();
  const allowed = parseServerPlatformAdminEmails();
  if (allowed.length > 0) return allowed.includes(normalized);
  return normalized.endsWith("@norfood.local");
}

async function resolveAuthContext() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = getSupabasePublishableKey();

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return { userId: "demo-admin", email: "demo@norfood.local" };
  }

  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: faça login para acessar o admin.");
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user?.id) {
    throw new Error("Unauthorized: sessão inválida.");
  }

  const email = userData.user.email?.toLowerCase() ?? null;
  return { userId: userData.user.id, email };
}

export async function resolvePlatformAdminFromBearerToken(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) {
    return { allowed: false as const, email: null, userId: null };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = getSupabasePublishableKey();
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return { allowed: false as const, email: null, userId: null };
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user?.id) {
    return { allowed: false as const, email: null, userId: null };
  }

  const email = userData.user.email?.toLowerCase() ?? null;
  return {
    allowed: isPlatformAdminEmailOnServer(email),
    email,
    userId: userData.user.id,
  };
}

export const requirePlatformAdmin = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    if (isServerDemoAdminMode()) {
      return next({
        context: {
          userId: "demo-admin",
          platformAdmin: true as const,
          adminEmail: "demo@norfood.local",
        },
      });
    }

    const { userId, email } = await resolveAuthContext();
    const resolvedEmail = email ?? (await getUserEmail(userId));

    if (!isPlatformAdminEmailOnServer(resolvedEmail)) {
      throw new Error("Acesso negado: apenas administradores da plataforma.");
    }

    return next({
      context: {
        userId,
        platformAdmin: true as const,
        adminEmail: resolvedEmail,
      },
    });
  },
);
