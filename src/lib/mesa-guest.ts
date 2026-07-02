const STORAGE_PREFIX = "mesa-guest-name:";

export function getMesaGuestName(mesaToken: string): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(`${STORAGE_PREFIX}${mesaToken}`);
  return value?.trim() || null;
}

export function setMesaGuestName(mesaToken: string, name: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(`${STORAGE_PREFIX}${mesaToken}`, name.trim());
}
