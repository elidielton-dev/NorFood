import { getOrderMetadataValue } from "@/lib/shared/db";

const ORDER_METADATA_KEYS = new Set([
  "cliente",
  "telefone",
  "email",
  "cep",
  "cidade",
  "uf",
  "bairro",
  "endereco",
  "referencia",
  "payment_mode",
  "troco_para",
  "gps_lat",
  "gps_lng",
  "gps_accuracy",
  "mp_provider",
  "mp_status",
  "mp_reference",
  "mp_payment_id",
  "mp_checkout_url",
  "mp_pix_qr_code",
  "mp_pix_qr_code_base64",
  "mp_expires_at",
  "mp_provider_expires_at",
  "mp_ticket_url",
]);

export function getOrderFreeNotes(observacoes: string | null | undefined) {
  if (!observacoes?.trim()) return null;
  const freeParts = observacoes
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const key = part.split("=")[0]?.trim().toLowerCase();
      return !key || !ORDER_METADATA_KEYS.has(key);
    });
  return freeParts.length > 0 ? freeParts.join(" · ") : null;
}

export function getOrderAddressForDisplay(
  endereco: string | null | undefined,
  observacoes: string | null | undefined,
  entregaEndereco?: string | null,
) {
  const fromMeta = getOrderMetadataValue(observacoes, "endereco");
  const raw = fromMeta || endereco?.trim() || entregaEndereco?.trim() || null;
  if (!raw) return null;
  if (/;\s*\w+=/.test(raw)) return null;
  return raw;
}

export function getOrderPhoneForDisplay(
  telefone: string | null | undefined,
  observacoes: string | null | undefined,
) {
  return telefone?.trim() || getOrderMetadataValue(observacoes, "telefone");
}

export function getOrderReferenceForDisplay(observacoes: string | null | undefined) {
  return getOrderMetadataValue(observacoes, "referencia");
}

export function formatNotaNumero(serie: string | null | undefined, numero: string | null | undefined) {
  if (!numero) return null;
  return serie ? `${serie}/${numero}` : numero;
}

export function simplifyNotaRejection(motivo: string | null | undefined) {
  if (!motivo?.trim()) return null;
  const text = motivo.trim();
  if (text.length <= 120) return text;
  return `${text.slice(0, 117)}...`;
}

export function shouldShowNeighborhood(bairro: string | null | undefined) {
  if (!bairro?.trim()) return false;
  const normalized = bairro.trim().toLowerCase();
  return normalized !== "bairro nao informado" && normalized !== "retirada no local";
}
