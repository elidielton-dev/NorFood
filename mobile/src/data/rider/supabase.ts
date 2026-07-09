import { mobileSupabase } from "../../lib/supabase";

export function requireSupabase() {
  if (!mobileSupabase) {
    throw new Error("Supabase nao configurado no app do entregador.");
  }
  return mobileSupabase;
}

export async function getCurrentUser() {
  const supabase = requireSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Sessao do entregador nao encontrada.");
  return user;
}
