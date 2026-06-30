const DEFAULT_APP_URL = "https://norfood.com.br";

/** URL pública base (sem barra final). Cliente usa origin atual; servidor usa env. */
export function getPublicAppUrl(): string {
  const fromEnv =
    (typeof process !== "undefined" ? process.env.PUBLIC_APP_URL : undefined)?.trim() ||
    (typeof import.meta !== "undefined" ? import.meta.env.VITE_PUBLIC_APP_URL : undefined)?.trim() ||
    (typeof import.meta !== "undefined" ? import.meta.env.VITE_APP_URL : undefined)?.trim();

  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return DEFAULT_APP_URL;
}

export function buildAppUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getPublicAppUrl()}${normalized}`;
}
