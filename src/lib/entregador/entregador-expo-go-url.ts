/** URL exp:// usada no QR do Expo Go (painel + API). */
export function isUnreachableDirectMetroUrl(url: string | null | undefined) {
  if (!url) return true;
  const normalized = url.trim();
  if (!normalized.startsWith("exp://")) return false;
  if (normalized.includes("exp.direct")) return false;
  return /exp:\/\/\d{1,3}(\.\d{1,3}){3}:8081/.test(normalized);
}

export function resolveExpoGoUrl(env: {
  expoGoUrl?: string | null;
  metroHost?: string | null;
  metroPort?: string | null;
}) {
  const direct = env.expoGoUrl?.trim();
  if (direct && !isUnreachableDirectMetroUrl(direct)) return direct;

  const host = env.metroHost?.trim();
  const port = env.metroPort?.trim() || "8081";
  if (host?.includes("exp.direct")) return `exp://${host}:80`;
  if (host && host !== "15.228.214.190") return `exp://${host}:${port}`;

  return "";
}

export function isExpoGoUrl(url: string) {
  return url.startsWith("exp://") || url.startsWith("exp+");
}
