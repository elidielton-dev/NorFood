import { BalcaoPos, type BalcaoOmnichannelPrefill } from "@/components/balcao/balcao-pos";
import type { ModoVenda, OrigemVenda } from "@/lib/api/omnichannel-order.functions";
import { usePainelSearch } from "@/lib/painel/use-painel-search";

function parsePdvSearch(search: Record<string, unknown> | null | undefined): BalcaoOmnichannelPrefill | null {
  const safe = search && typeof search === "object" ? search : {};
  const conversationId =
    typeof safe.conversationId === "string" ? safe.conversationId : undefined;
  const phone = typeof safe.phone === "string" ? safe.phone : undefined;
  const name = typeof safe.name === "string" ? safe.name : undefined;
  const clienteId = typeof safe.clienteId === "string" ? safe.clienteId : undefined;
  const wabaContactId =
    typeof safe.wabaContactId === "string" ? safe.wabaContactId : undefined;
  const origem = typeof safe.origem === "string" ? (safe.origem as OrigemVenda) : undefined;
  const modo = typeof safe.modo === "string" ? (safe.modo as ModoVenda) : undefined;

  if (!conversationId && !phone && !name && !clienteId && !wabaContactId) {
    return null;
  }

  return {
    origem,
    conversationId,
    phone,
    name,
    clienteId,
    wabaContactId,
    modo,
  };
}

/** Página do PDV — usada em /t/:slug/pdv e /painel/pdv */
export function BalcaoPage() {
  const prefill = usePainelSearch(parsePdvSearch);
  return <BalcaoPos prefill={prefill} />;
}
