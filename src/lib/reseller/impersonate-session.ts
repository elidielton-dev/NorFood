const STORAGE_KEY = "norfood_impersonate";

export type ImpersonateSession = {
  mode: "reseller" | "platform";
  tenantSlug: string;
  returnTo: string;
};

export function readImpersonateSession(): ImpersonateSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImpersonateSession;
  } catch {
    return null;
  }
}

export function writeImpersonateSession(session: ImpersonateSession) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearImpersonateSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
