import { lazy, Suspense } from "react";
import { LazyChunkBoundary } from "@/components/shared/lazy-chunk-boundary";

const OrderLiveMapClient = lazy(() =>
  import("@/components/delivery/order-live-map").then((module) => ({
    default: module.OrderLiveMap,
  })),
);

export function OrderLiveMap({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: number;
}) {
  return (
    <LazyChunkBoundary resetKey={`${orderId}-${orderNumber}`}>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <OrderLiveMapClient orderId={orderId} orderNumber={orderNumber} />
      </Suspense>
    </LazyChunkBoundary>
  );
}
