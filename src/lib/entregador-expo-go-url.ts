/** URL exp:// usada no QR do Expo Go (painel + API). */
export function resolveExpoGoUrl(env: {
  expoGoUrl?: string | null;
  metroHost?: string | null;
  metroPort?: string | null;
}) {
  const direct = env.expoGoUrl?.trim();
  if (direct) return direct;

  const host = env.metroHost?.trim() || "15.228.214.190";
  const port = env.metroPort?.trim() || "8081";
  return `exp://${host}:${port}`;
}

export function isExpoGoUrl(url: string) {
  return url.startsWith("exp://") || url.startsWith("exp+");
}
