import { createContext, useContext } from "react";
import type { RiderRealtimeLocation } from "../types";

export type LocationContextValue = {
  currentLocation: RiderRealtimeLocation | null;
  routeHistory: RiderRealtimeLocation[];
  trackingActive: boolean;
  usingMockTracking: boolean;
  permissionsGranted: boolean;
  backgroundPermissionsGranted: boolean;
  requestPermissions: () => Promise<boolean>;
  stopTracking: () => Promise<void>;
};

export const LocationContext = createContext<LocationContextValue | null>(null);

export function useLocationContext() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error("useLocationContext must be used within LocationProvider");
  }
  return context;
}
