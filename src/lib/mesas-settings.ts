export type MesasSettings = {
  /** Imprime na cozinha (KDS) quando chega pedido pelo QR da mesa. */
  qrAutoPrintKitchen: boolean;
};

export const DEFAULT_MESAS_SETTINGS: MesasSettings = {
  qrAutoPrintKitchen: true,
};

export function parseMesasSettings(raw: unknown): MesasSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MESAS_SETTINGS };
  const row = raw as Record<string, unknown>;
  return {
    qrAutoPrintKitchen:
      typeof row.qrAutoPrintKitchen === "boolean"
        ? row.qrAutoPrintKitchen
        : DEFAULT_MESAS_SETTINGS.qrAutoPrintKitchen,
  };
}

export function extractMesaQrCustomerName(observacoes: string | null | undefined): string | null {
  if (!observacoes) return null;
  const match = observacoes.match(/Cliente:\s*([^·]+)/i);
  return match?.[1]?.trim() || null;
}

export function extractMesaQrNumero(observacoes: string | null | undefined): number | null {
  if (!observacoes) return null;
  const match = observacoes.match(/Mesa\s+(\d+)/i);
  if (!match) return null;
  const numero = Number(match[1]);
  return Number.isFinite(numero) ? numero : null;
}
