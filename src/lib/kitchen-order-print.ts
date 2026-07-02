import { fetchKdsOrderItemsServer } from "@/lib/api/delivery-panel.functions";
import { formatBRL, type Pedido } from "@/lib/db";
import { extractMesaQrCustomerName, extractMesaQrNumero } from "@/lib/mesas-settings";
import { printHtmlReceipt } from "@/lib/print";

type KitchenOrderItem = {
  quantidade: number;
  produtos?: { nome?: string | null } | null;
  observacao?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderKitchenQrOrderHtml({
  pedido,
  itens,
  mesaNumero,
  customerName,
}: {
  pedido: Pedido;
  itens: KitchenOrderItem[];
  mesaNumero: number | null;
  customerName: string | null;
}) {
  const itensHtml = itens
    .map((item) => {
      const nome = item.produtos?.nome ?? "Item";
      return `
        <li style="margin-bottom:10px;font-size:16px;">
          <strong>${item.quantidade}x</strong> ${escapeHtml(nome)}
        </li>
      `;
    })
    .join("");

  const mesaLabel = mesaNumero != null ? `Mesa ${mesaNumero}` : "Mesa QR";
  const clienteLabel = customerName ?? "Cliente";

  return `
    <div style="font-family:'Courier New',monospace;color:#111;padding:8px 4px;">
      <p style="margin:0 0 8px;font-size:22px;font-weight:800;text-align:center;text-transform:uppercase;">
        ${escapeHtml(mesaLabel)}
      </p>
      <p style="margin:0 0 4px;font-size:14px;text-align:center;">Pedido #${pedido.numero}</p>
      <p style="margin:0 0 12px;font-size:14px;text-align:center;">
        ${new Date(pedido.updated_at ?? pedido.created_at).toLocaleString("pt-BR")}
      </p>
      <p style="margin:0 0 16px;font-size:15px;font-weight:700;text-align:center;">
        ${escapeHtml(clienteLabel)}
      </p>
      <div style="border-top:2px dashed #111;padding-top:12px;margin-top:12px;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;">Itens</p>
        <ul style="list-style:none;padding:0;margin:0;">
          ${itensHtml}
        </ul>
      </div>
      <div style="border-top:2px dashed #111;padding-top:12px;margin-top:16px;">
        <p style="margin:0;font-size:15px;font-weight:700;text-align:right;">
          Total: ${formatBRL(pedido.total)}
        </p>
      </div>
      <p style="margin:16px 0 0;font-size:12px;text-align:center;color:#555;">
        QR Code · Cozinha
      </p>
    </div>
  `;
}

export async function printKitchenQrOrder(pedido: Pedido, tenantSlug: string) {
  const itens = await fetchKdsOrderItemsServer({
    data: { tenantSlug, orderId: pedido.id },
  });

  const mesaNumero = extractMesaQrNumero(pedido.observacoes);
  const customerName = extractMesaQrCustomerName(pedido.observacoes);

  const bodyHtml = renderKitchenQrOrderHtml({
    pedido,
    itens,
    mesaNumero,
    customerName,
  });

  const title = mesaNumero
    ? `Cozinha — Mesa ${mesaNumero} #${pedido.numero}`
    : `Cozinha — Pedido #${pedido.numero}`;

  await printHtmlReceipt(title, bodyHtml);
}
