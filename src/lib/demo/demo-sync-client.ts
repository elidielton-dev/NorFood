const DEMO_SYNC_PORT = "4318";
const FALLBACK_RENDER_URL = "https://abelha-e-mel-ops.onrender.com";

function getBaseUrl() {
  const envUrl =
    (typeof process !== "undefined" ? process.env.DEMO_SYNC_BASE_URL : undefined) ||
    import.meta.env.VITE_DEMO_SYNC_URL;

  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }

  if (typeof window === "undefined") {
    return FALLBACK_RENDER_URL;
  }
  const host = window.location.hostname || "127.0.0.1";
  if (host.includes("vercel.app")) {
    return FALLBACK_RENDER_URL;
  }
  return `http://${host}:${DEMO_SYNC_PORT}`;
}

export async function fetchDemoSync<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Demo sync request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}
