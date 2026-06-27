export function resolveAvatarUrl(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return stripCacheBuster(candidate.trim());
    }
  }
  return "";
}

export function stripCacheBuster(url: string): string {
  if (!url) return "";
  return url.replace(/([?&])v=\d+(?=&|$)/, "").replace(/\?$/, "");
}

export function withCacheBuster(url: string): string {
  const clean = stripCacheBuster(url);
  if (!clean) return "";
  const separator = clean.includes("?") ? "&" : "?";
  return `${clean}${separator}v=${Date.now()}`;
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const normalized = base64.includes(",") ? base64.split(",").pop() ?? "" : base64;
  const binary = globalThis.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export function riderInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "E"
  );
}
