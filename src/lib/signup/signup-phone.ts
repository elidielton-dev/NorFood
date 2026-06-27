export function normalizeBrazilPhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

export function formatBrazilPhone(value: string) {
  const digits = normalizeBrazilPhone(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function validateBrazilMobilePhone(value: string):
  | { ok: true; digits: string; formatted: string }
  | { ok: false; error: string } {
  const digits = normalizeBrazilPhone(value);
  if (digits.length < 10 || digits.length > 11) {
    return { ok: false, error: "Informe o celular com DDD (ex.: 11 99999-9999)." };
  }
  const ddd = Number.parseInt(digits.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) {
    return { ok: false, error: "DDD inválido." };
  }
  if (digits.length === 10) {
    return {
      ok: false,
      error: "Informe o celular com o 9 na frente (11 dígitos).",
    };
  }
  if (digits[2] !== "9") {
    return { ok: false, error: "Use um número de celular válido." };
  }
  return { ok: true, digits, formatted: formatBrazilPhone(digits) };
}

export function phoneToE164(digits: string) {
  return `+55${digits}`;
}
