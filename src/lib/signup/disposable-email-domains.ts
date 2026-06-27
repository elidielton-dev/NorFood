/** Domínios de e-mail descartável bloqueados no cadastro SaaS. */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "throwaway.email",
  "yopmail.com",
  "yopmail.fr",
  "sharklasers.com",
  "trashmail.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "fakeinbox.com",
  "mintemail.com",
  "emailondeck.com",
  "tempail.com",
  "inboxkitten.com",
  "mailnesia.com",
]);

export function isDisposableEmail(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return true;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  if (domain.endsWith(".norfood.local")) return true;
  return false;
}
