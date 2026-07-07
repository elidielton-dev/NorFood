import { lazy, Suspense } from "react";
import { LazyChunkBoundary } from "@/components/shared/lazy-chunk-boundary";

type FleetRider = {
  id: string;
  nome: string;
  status: string;
  speed: number;
  battery: number | null;
  updatedAt: string | null;
  location: { latitude: number; longitude: number } | null;
  activeOrders: Array<{ id: string; numero: number }>;
};

const DeliveryFleetMapClient = lazy(() =>
  import("@/components/delivery/delivery-fleet-map").then((module) => ({
    default: module.DeliveryFleetMap,
  })),
);

export function DeliveryFleetMap({ riders }: { riders: FleetRider[] }) {
  return (
    <LazyChunkBoundary resetKey={riders.map((rider) => rider.id).join(",")}>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-muted" />}>
        <DeliveryFleetMapClient riders={riders} />
      </Suspense>
    </LazyChunkBoundary>
  );
}
