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

export function isPlatformAdminEmailOnServer(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase();
  const allowed = parseServerPlatformAdminEmails();
  if (allowed.length > 0) return allowed.includes(normalized);
  return normalized.endsWith("@norfood.local");
}

async function resolveAuthContext() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

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

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Error("Unauthorized: sessão inválida.");
  }

  const email = (data.claims.email as string | undefined)?.toLowerCase() ?? null;
  return { userId: data.claims.sub, email };
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
