import { lazy, Suspense } from "react";

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
  import("@/components/delivery-fleet-map").then((module) => ({
    default: module.DeliveryFleetMap,
  })),
);

export function DeliveryFleetMap({ riders }: { riders: FleetRider[] }) {
  return (
    <Suspense fallback={<div className="h-80 rounded-2xl bg-muted animate-pulse" />}>
      <DeliveryFleetMapClient riders={riders} />
    </Suspense>
  );
}
