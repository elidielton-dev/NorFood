import { isUnreachableDirectMetroUrl } from "@/lib/entregador-expo-go-url";

type ExpoManifest = {
  extra?: {
    expoGo?: { debuggerHost?: string };
    expoClient?: { hostUri?: string };
  };
};

const METRO_INTERNAL_BASES = [
  process.env.EXPO_METRO_INTERNAL_URL,
  "http://expo-metro:8081",
  "http://127.0.0.1:8081",
].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);

function expUrlFromDebuggerHost(host: string) {
  const trimmed = host.trim();
  if (!trimmed) return null;
  if (trimmed.includes("exp.direct")) return `exp://${trimmed}:80`;
  if (trimmed.includes("/")) {
    const [hostname] = trimmed.split("/");
    return hostname ? `exp://${hostname}` : null;
  }
  return `exp://${trimmed}`;
}

export async function fetchExpoGoUrlFromMetroManifest(): Promise<string | null> {
  for (const base of METRO_INTERNAL_BASES) {
    try {
      const res = await fetch(`${base}/index.exp?platform=android`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      const manifest = (await res.json()) as ExpoManifest;
      const debuggerHost =
        manifest.extra?.expoGo?.debuggerHost ?? manifest.extra?.expoClient?.hostUri ?? null;
      if (!debuggerHost) continue;
      return expUrlFromDebuggerHost(debuggerHost);
    } catch {
      // tenta próximo endpoint interno
    }
  }
  return null;
}

export async function resolveExpoGoUrlForServer(env: {
  fileUrl?: string | null;
  configuredUrl?: string | null;
  metroHost?: string | null;
  metroPort?: string | null;
}) {
  const candidates = [
    await fetchExpoGoUrlFromMetroManifest(),
    env.fileUrl,
    env.configuredUrl,
  ];

  for (const candidate of candidates) {
    const url = candidate?.trim();
    if (!url) continue;
    if (isUnreachableDirectMetroUrl(url)) continue;
    return url;
  }

  const host = env.metroHost?.trim();
  const port = env.metroPort?.trim() || "8081";
  if (host && host.includes("exp.direct")) return `exp://${host}:80`;
  return null;
}
