export type NotaFiscalRow = {
  id: string;
  pedido_id: string | null;
  tipo: string;
  status: string;
  chave_acesso: string | null;
  numero: string | null;
  serie: string | null;
  valor: number;
  protocolo_sefaz: string | null;
  codigo_status: number | null;
  motivo_rejeicao: string | null;
  qrcode_url: string | null;
  xml_autorizado?: string | null;
  created_at: string;
};

export function isNotaAutorizada(status: string) {
  return status === "autorizada" || status === "autorizada_homologacao";
}

export function canCancelarNota(nota: NotaFiscalRow) {
  return isNotaAutorizada(nota.status) && Boolean(nota.chave_acesso?.trim()) && Boolean(nota.protocolo_sefaz?.trim());
}

export function labelNotaStatus(status: string) {
  const map: Record<string, string> = {
    autorizada: "Autorizada",
    autorizada_homologacao: "Autorizada",
    rejeitada: "Rejeitada",
    cancelada: "Cancelada",
    pendente: "Pendente",
  };
  return map[status] ?? status;
}

export function labelSefazCStat(cStat: string | number | null | undefined) {
  if (cStat == null || cStat === "") return "—";
  const code = String(cStat);
  const map: Record<string, string> = {
    "100": "Autorizada",
    "101": "Cancelada",
    "102": "Inutilizacao homologada",
    "110": "Uso denegado",
    "135": "Evento registrado",
    "136": "Evento vinculado",
    "217": "Rejeitada na SEFAZ",
  };
  return map[code] ? `${code} — ${map[code]}` : code;
}

export function notaStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "autorizada" || status === "autorizada_homologacao") return "success";
  if (status === "cancelada") return "warning";
  if (status === "rejeitada") return "danger";
  return "neutral";
}
