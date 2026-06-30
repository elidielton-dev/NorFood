import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Restaura a sessão persistida (localStorage). Não força refresh em toda navegação
 * (autoRefreshToken do client cuida disso em background).
 */
export async function getAuthenticatedSession(): Promise<Session | null> {
  if (typeof window === "undefined") return null;

  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function getAuthenticatedUser(): Promise<User | null> {
  const session = await getAuthenticatedSession();
  if (session?.user) return session.user;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getAuthenticatedSession();
  return session?.access_token ?? null;
}
