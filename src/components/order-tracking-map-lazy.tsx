import { lazy, Suspense } from "react";

const OrderTrackingMapClient = lazy(() =>
  import("@/components/order-tracking-map").then((module) => ({
    default: module.OrderTrackingMap,
  })),
);

export function OrderTrackingMap({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: number;
}) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
      <OrderTrackingMapClient orderId={orderId} orderNumber={orderNumber} />
    </Suspense>
  );
}
