import type { Session } from "@supabase/supabase-js";
import { mobileSupabase } from "../../lib/supabase";
import { requireSupabase } from "./supabase";

export async function getCurrentSession() {
  if (!mobileSupabase) return null;
  const supabase = requireSupabase();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

export function subscribeToAuthChanges(listener: (session: Session | null) => void) {
  if (!mobileSupabase) {
    return () => undefined;
  }
  const supabase = requireSupabase();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    listener(session);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

export async function loginRider(identifier: string, password: string) {
  const supabase = requireSupabase();
  const email = identifier.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new Error("Use o e-mail cadastrado do entregador.");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
}

export async function logoutRider() {
  const supabase = requireSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
