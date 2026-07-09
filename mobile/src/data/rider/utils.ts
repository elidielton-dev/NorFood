export function getMetadataValue(observacoes: string | null | undefined, key: string) {
  if (!observacoes) return "";
  const match = observacoes.match(new RegExp(`${key}=([^;]+)`, "i"));
  return match?.[1]?.trim() ?? "";
}

export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

export function buildQuickLinks(phone: string, text: string) {
  const digits = formatPhone(phone);
  const encoded = encodeURIComponent(text);
  return {
    whatsapp: `https://wa.me/${digits}?text=${encoded}`,
    sms: `sms:${digits}?body=${encoded}`,
  };
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function estimateEtaFromDistance(distance: number | null) {
  return Math.max(8, Math.round((Number(distance ?? 4) / 22) * 60));
}

export function isDeliveredQueueConflict(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}) {
  return (
    error.code === "23505" &&
    `${error.message ?? ""} ${error.details ?? ""}`.includes(
      "rotas_entrega_entregador_id_ordem_entrega_key",
    )
  );
}
