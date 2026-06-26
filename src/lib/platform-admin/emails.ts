export function parsePlatformAdminEmails(raw?: string): string[] {
  const source = raw ?? (typeof import.meta !== "undefined" ? import.meta.env.VITE_PLATFORM_ADMIN_EMAILS : "") ?? "";
  return String(source)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase();
  const allowed = parsePlatformAdminEmails();
  if (allowed.length > 0) return allowed.includes(normalized);
  return normalized.endsWith("@norfood.local");
}
