import { isValidCnpj, onlyDigits } from "@/lib/fiscal/fiscal-validation";

export type DocumentType = "cnpj" | "cpf";

function calcCpfCheckDigit(base: string, factorStart: number) {
  let sum = 0;
  for (let i = 0; i < base.length; i += 1) {
    sum += Number(base[i]) * (factorStart - i);
  }
  const mod = (sum * 10) % 11;
  return mod === 10 ? 0 : mod;
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const d1 = calcCpfCheckDigit(cpf.slice(0, 9), 10);
  const d2 = calcCpfCheckDigit(cpf.slice(0, 10), 11);
  return cpf === cpf.slice(0, 9) + String(d1) + String(d2);
}

export function formatCpf(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function normalizeDocument(type: DocumentType, value: string) {
  const digits = onlyDigits(value);
  if (type === "cnpj") return digits.slice(0, 14);
  return digits.slice(0, 11);
}

export function validateDocument(type: DocumentType, value: string) {
  const normalized = normalizeDocument(type, value);
  if (type === "cnpj") {
    if (!isValidCnpj(normalized)) return { ok: false as const, error: "CNPJ inválido." };
    return { ok: true as const, normalized };
  }
  if (!isValidCpf(normalized)) return { ok: false as const, error: "CPF inválido." };
  return { ok: true as const, normalized };
}

export function formatDocument(type: DocumentType, value: string) {
  return type === "cnpj" ? formatCnpj(value) : formatCpf(value);
}

function formatCnpj(value: string) {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
