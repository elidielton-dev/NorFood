export type KitchenStage = "aprovado" | "producao";

const STAGE_TOKEN = "cozinha_etapa=producao";

export function getKitchenStage(observacoes: string | null | undefined): KitchenStage {
  if (!observacoes) return "aprovado";
  return observacoes.includes(STAGE_TOKEN) ? "producao" : "aprovado";
}

export function withKitchenStage(
  observacoes: string | null | undefined,
  stage: KitchenStage,
): string | null {
  const base = (observacoes ?? "")
    .replace(/;?\s*cozinha_etapa=[^;]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (stage === "aprovado") return base || null;
  if (!base) return STAGE_TOKEN;
  return `${base}; ${STAGE_TOKEN}`;
}

export const KITCHEN_ORDER_CHANNELS = new Set(["delivery", "qrcode", "mesa", "balcao"]);

export function isKitchenOrderChannel(canal: string) {
  return KITCHEN_ORDER_CHANNELS.has(canal);
}
