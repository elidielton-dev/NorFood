import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as
  | {
      supabase?: {
        url?: string;
        publishableKey?: string;
      };
    }
  | undefined;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabase?.url;
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? extra?.supabase?.publishableKey;

export const mobileSupabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export function mobileSupabaseEnabled() {
  return Boolean(mobileSupabase);
}

export function getMobileSupabaseConfigError() {
  if (mobileSupabase) return null;
  if (!supabaseUrl && !supabaseKey) {
    return "Configure EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env da raiz.";
  }
  if (!supabaseUrl) return "EXPO_PUBLIC_SUPABASE_URL ausente.";
  if (!supabaseKey) return "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausente.";
  return "Supabase nao configurado.";
}
