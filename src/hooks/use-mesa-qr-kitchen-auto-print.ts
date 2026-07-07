import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { fetchTenantAdminSettingsServer } from "@/lib/api/tenant/tenant-settings-admin.functions";
import type { Pedido } from "@/lib/shared/db";
import { printKitchenQrOrder } from "@/lib/kitchen-order-print";
import { DEFAULT_MESAS_SETTINGS } from "@/lib/mesas-settings";

function isQrKitchenCandidate(pedido: Pedido) {
  return (
    pedido.canal === "qrcode" && pedido.status !== "entregue" && pedido.status !== "cancelado"
  );
}

export function useMesaQrKitchenAutoPrint({
  tenantSlug,
  pedidos,
  isReady,
}: {
  tenantSlug: string;
  pedidos: Pedido[];
  isReady: boolean;
}) {
  const printedRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const { data: adminSettings } = useQuery({
    queryKey: ["tenant-admin-settings", tenantSlug],
    queryFn: () => fetchTenantAdminSettingsServer({ data: tenantSlug }),
    staleTime: 30_000,
  });

  const autoPrintEnabled =
    adminSettings?.settings.mesas?.qrAutoPrintKitchen ?? DEFAULT_MESAS_SETTINGS.qrAutoPrintKitchen;

  useEffect(() => {
    if (!isReady || !autoPrintEnabled) return;

    const candidates = pedidos.filter(isQrKitchenCandidate);
    const toPrint: Pedido[] = [];

    for (const pedido of candidates) {
      const fingerprint = `${pedido.id}:${pedido.updated_at}`;
      if (printedRef.current.has(fingerprint)) continue;

      if (!initializedRef.current) {
        printedRef.current.add(fingerprint);
        continue;
      }

      printedRef.current.add(fingerprint);
      toPrint.push(pedido);
    }

    initializedRef.current = true;
    if (toPrint.length === 0) return;

    void (async () => {
      for (const pedido of toPrint) {
        try {
          await printKitchenQrOrder(pedido, tenantSlug);
          toast.success(`Pedido QR #${pedido.numero} enviado para a cozinha.`);
        } catch (error: unknown) {
          const fingerprint = `${pedido.id}:${pedido.updated_at}`;
          printedRef.current.delete(fingerprint);
          toast.error(
            error instanceof Error ? error.message : "Nao foi possivel imprimir o pedido da mesa.",
          );
        }
      }
    })();
  }, [pedidos, isReady, autoPrintEnabled, tenantSlug]);
}
