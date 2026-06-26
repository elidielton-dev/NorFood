import { useMemo } from "react";
import { useLocationContext } from "./LocationContext";

export function useRealtimeLocation() {
  const context = useLocationContext();

  return useMemo(
    () => ({
      currentLocation: context.currentLocation,
      routeHistory: context.routeHistory,
      trackingActive: context.trackingActive,
      permissionsGranted: context.permissionsGranted,
      backgroundPermissionsGranted: context.backgroundPermissionsGranted,
      requestPermissions: context.requestPermissions,
      stopTracking: context.stopTracking,
    }),
    [context],
  );
}
