export const DEMO_SESSION_KEY = "abelha-mel-demo-session";

export function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function isDemoSession() {
  if (!canUseBrowserStorage()) return false;
  return window.localStorage.getItem(DEMO_SESSION_KEY) === "1";
}

export function setDemoSession(enabled: boolean) {
  if (!canUseBrowserStorage()) return;
  if (enabled) {
    window.localStorage.setItem(DEMO_SESSION_KEY, "1");
    return;
  }
  window.localStorage.removeItem(DEMO_SESSION_KEY);
}

export function hasBrowserSupabaseConfig() {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
}

/** App em producao: Supabase configurado e demo explicitamente desligado. */
export function isProductionMode() {
  if (import.meta.env.VITE_DEMO_MODE === "true") return false;
  return hasBrowserSupabaseConfig();
}

export function isBrowserDemoEnabled() {
  if (import.meta.env.VITE_DEMO_MODE === "true") return true;
  if (import.meta.env.VITE_DEMO_MODE === "false") return isDemoSession();
  if (!hasBrowserSupabaseConfig()) return true;
  return isDemoSession();
}
