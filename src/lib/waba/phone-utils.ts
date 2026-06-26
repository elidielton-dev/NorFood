/**
 * Sanitize phone number for Meta WhatsApp API.
 * Meta requires digits only — no + prefix, no spaces, no dashes.
 * e.g. "+370 63949836" → "37063949836"
 */
export function sanitizePhoneForMeta(phone: string): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

/**
 * Normalize phone number by removing all non-digit characters.
 * Used for comparing phone numbers in different formats.
 */
export function normalizePhone(phone: string): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

/**
 * Compare two phone numbers accounting for trunk prefix differences.
 * e.g. "370063949836" (with trunk 0) matches "37063949836" (without trunk 0)
 * by comparing the last 8 digits.
 */
export function phonesMatch(phone1: string, phone2: string): boolean {
  const n1 = normalizePhone(phone1);
  const n2 = normalizePhone(phone2);
  if (n1 === n2) return true;
  if (n1.length >= 8 && n2.length >= 8) {
    return n1.slice(-8) === n2.slice(-8);
  }
  return false;
}

/**
 * Validate phone number is E.164-like format (7-15 digits starting with non-zero).
 * Accepts with or without + prefix.
 */
export function isValidE164(phone: string): boolean {
  return /^\+?[1-9]\d{6,14}$/.test(phone);
}

/**
 * Generate plausible phone number variants for retry when Meta's
 * sandbox rejects a number with error #131030 ("not in allowed list").
 *
 * Many countries use a "trunk prefix" 0 for domestic dialing that is
 * meant to be dropped in international format (e.g. Lithuanian
 * "+370 063 949 836" domestically → "+370 63 949 836" international).
 * But some sandboxes register the number with the trunk 0 included,
 * causing sends to the correct international format to fail.
 *
 * This helper yields up to 3 variants:
 *   1. The original sanitized number (first attempt)
 *   2. With a trunk 0 inserted after the country code
 *   3. With a trunk 0 removed after the country code
 *
 * Country-code lengths of 1, 2, and 3 digits are tried because we
 * don't know the user's country ahead of time.
 *
 * @param sanitized - digits-only phone number (from sanitizePhoneForMeta)
 * @returns deduplicated list of variants, original first
 */
export function phoneVariants(sanitized: string): string[] {
  if (!sanitized) return [];
  const seen = new Set<string>();
  const push = (v: string) => {
    if (v && !seen.has(v)) seen.add(v);
  };

  // 1. Original
  push(sanitized);

  // 2. Insert a 0 after each plausible country-code length
  for (const ccLen of [1, 2, 3]) {
    if (sanitized.length <= ccLen) continue;
    const cc = sanitized.slice(0, ccLen);
    const rest = sanitized.slice(ccLen);
    if (!rest.startsWith("0")) {
      push(cc + "0" + rest);
    }
  }

  // 3. Remove a leading 0 after each plausible country-code length
  for (const ccLen of [1, 2, 3]) {
    if (sanitized.length <= ccLen + 1) continue;
    const cc = sanitized.slice(0, ccLen);
    const rest = sanitized.slice(ccLen);
    if (rest.startsWith("0")) {
      push(cc + rest.slice(1));
    }
  }

  return [...seen];
}

/**
 * Formato canônico para gravar contato (evita duplicar 558781189176 vs 5587981189176).
 * Meta inbound usa wa_id sem o 9 extra após o DDD.
 */
export function canonicalContactPhone(phone: string): string {
  let digits = normalizePhone(phone);
  // BR sem DDI (87 98118-9176 → 5587…)
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  const brWithNine = digits.match(/^55(\d{2})9(\d{8})$/);
  if (brWithNine) {
    return `55${brWithNine[1]}${brWithNine[2]}`;
  }
  return digits;
}

/**
 * true se dois números são o mesmo contato BR (com/sem 9º dígito).
 */
export function brazilSamePhone(a: string, b: string): boolean {
  return canonicalContactPhone(a) === canonicalContactPhone(b);
}

/**
 * Variantes comuns para números BR no sandbox Meta.
 * Inbound vem como 558781189176 (sem 9); envio exige 5587981189176 (com 9).
 */
export function brazilWhatsAppVariants(sanitized: string): string[] {
  if (!sanitized) return [];
  const seen = new Set<string>();
  const push = (v: string) => {
    if (v && !seen.has(v)) seen.add(v);
  };

  push(sanitized);

  const withoutNine = sanitized.match(/^55(\d{2})(\d{8})$/);
  if (withoutNine) {
    push(`55${withoutNine[1]}9${withoutNine[2]}`);
  }

  const withNine = sanitized.match(/^55(\d{2})9(\d{8})$/);
  if (withNine) {
    push(`55${withNine[1]}${withNine[2]}`);
  }

  return [...seen];
}

/**
 * Número preferido para envio Meta (sandbox BR exige 9 após DDD).
 */
export function metaSendTargetPhone(contactPhone: string): string {
  const canonical = canonicalContactPhone(contactPhone);
  const br = canonical.match(/^55(\d{2})(\d{8})$/);
  if (br) return `55${br[1]}9${br[2]}`;
  return canonical;
}

/**
 * Todas as variantes a tentar no envio Meta.
 * Sandbox BR: tenta COM 9 primeiro (lista de teste Meta usa esse formato).
 */
export function metaSendPhoneVariants(sanitized: string): string[] {
  const raw = [...brazilWhatsAppVariants(sanitized), ...phoneVariants(sanitized)];
  const seen = new Set<string>();
  const ordered: string[] = [];

  const push = (v: string) => {
    if (v && !seen.has(v)) {
      seen.add(v);
      ordered.push(v);
    }
  };

  // BR com 9º dígito primeiro (ex.: 5587981189176)
  for (const v of raw) {
    if (/^55\d{2}9\d{8}$/.test(v)) push(v);
  }
  for (const v of raw) push(v);

  return ordered;
}

/**
 * Returns true when the Meta API error indicates the recipient
 * phone number isn't in the allowed list (sandbox restriction).
 * Detected via error code 131030 or the standard error text.
 */
export function isRecipientNotAllowedError(message: string): boolean {
  return /131030|not in allowed list|not in the allowed list/i.test(message);
}
