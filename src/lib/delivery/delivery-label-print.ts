import { fetchKdsOrderItemsServer } from "@/lib/api/delivery/delivery-panel.functions";
import { fetchTenantAdminSettingsServer } from "@/lib/api/tenant/tenant-settings-admin.functions";
import { formatBRL, getOrderMetadataValue, getOrderNeighborhood, type Pedido } from "@/lib/shared/db";
import { printHtmlReceipt } from "@/lib/shared/print";
import { extractMesaQrCustomerName } from "@/lib/mesas-settings";

type LabelItem = {
  quantidade: number;
  produtos?: { nome?: string | null } | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderDeliveryLabelHtml({
  pedido,
  itens,
  customerName,
}: {
  pedido: Pedido;
  itens: LabelItem[];
  customerName: string;
}) {
  const bairro = getOrderNeighborhood(pedido);
  const endereco = pedido.endereco ?? "Endereco nao informado";
  const itensHtml = itens
    .map((item) => {
      const nome = item.produtos?.nome ?? "Item";
      return `<li style="margin-bottom:8px;font-size:14px;"><strong>${item.quantidade}x</strong> ${escapeHtml(nome)}</li>`;
    })
    .join("");

  return `
    <div style="font-family:'Courier New',monospace;color:#111;padding:8px 4px;max-width:320px;">
      <p style="margin:0 0 8px;font-size:20px;font-weight:800;text-align:center;text-transform:uppercase;">
        Etiqueta Delivery
      </p>
      <p style="margin:0 0 4px;font-size:14px;text-align:center;">Pedido #${pedido.numero}</p>
      <p style="margin:0 0 12px;font-size:13px;text-align:center;">
        ${new Date(pedido.updated_at ?? pedido.created_at).toLocaleString("pt-BR")}
      </p>
      <p style="margin:0 0 6px;font-size:15px;font-weight:700;">${escapeHtml(customerName)}</p>
      <p style="margin:0 0 4px;font-size:13px;">${escapeHtml(endereco)}</p>
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;">${escapeHtml(bairro)}</p>
      <div style="border-top:2px dashed #111;padding-top:10px;">
        <ul style="list-style:none;padding:0;margin:0;">${itensHtml}</ul>
      </div>
      <div style="border-top:2px dashed #111;padding-top:10px;margin-top:12px;">
        <p style="margin:0;font-size:14px;font-weight:700;text-align:right;">Total: ${formatBRL(pedido.total)}</p>
        <p style="margin:4px 0 0;font-size:12px;text-align:right;">Pagamento: ${escapeHtml(pedido.forma_pagamento ?? "—")}</p>
      </div>
    </div>
  `;
}

export async function printDeliveryLabel(pedido: Pedido, tenantSlug: string) {
  const [itens, settings] = await Promise.all([
    fetchKdsOrderItemsServer({ data: { tenantSlug, orderId: pedido.id } }),
    fetchTenantAdminSettingsServer({ data: tenantSlug }),
  ]);

  const printer = settings.settings.printers.delivery;
  const customerName =
    extractMesaQrCustomerName(pedido.observacoes) ??
    getOrderMetadataValue(pedido.observacoes, "customer_name") ??
    "Cliente";

  const bodyHtml = renderDeliveryLabelHtml({ pedido, itens, customerName });
  const title = `Etiqueta delivery #${pedido.numero}`;

  if (printer?.showPreview) {
    await printHtmlReceipt(title, bodyHtml);
    return;
  }

  for (let copy = 0; copy < (printer?.copies ?? 1); copy += 1) {
    await printHtmlReceipt(title, bodyHtml);
  }
}
