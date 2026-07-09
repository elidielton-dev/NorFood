import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { LocationTrackingService } from "./LocationTrackingService";
import { useAppData } from "../context/AppDataContext";
import type { RiderRealtimeLocation } from "../types";
import { LocationContext, type LocationContextValue } from "./LocationContext";

export function LocationProvider({ children }: PropsWithChildren) {
  const serviceRef = useRef(new LocationTrackingService());
  const { state, pushLocationPing } = useAppData();
  const deliveriesRef = useRef(state.deliveries);
  const pushLocationPingRef = useRef(pushLocationPing);
  const [currentLocation, setCurrentLocation] = useState<RiderRealtimeLocation | null>(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [usingMockTracking, setUsingMockTracking] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [backgroundPermissionsGranted, setBackgroundPermissionsGranted] = useState(false);

  useEffect(() => {
    deliveriesRef.current = state.deliveries;
  }, [state.deliveries]);

  useEffect(() => {
    pushLocationPingRef.current = pushLocationPing;
  }, [pushLocationPing]);

  async function requestPermissions() {
    const result = await serviceRef.current.requestPermissions();
    setPermissionsGranted(result.granted);
    setBackgroundPermissionsGranted(result.backgroundGranted);
    return result.granted;
  }

  async function stopTracking() {
    await serviceRef.current.stop();
    setTrackingActive(false);
  }

  useEffect(() => {
    if (!state.loggedIn) {
      void stopTracking();
      return;
    }

    let mounted = true;
    const service = serviceRef.current;

    const start = async () => {
      const permissionResult = await service.requestPermissions();
      if (!mounted) return;
      setPermissionsGranted(permissionResult.granted);
      setBackgroundPermissionsGranted(permissionResult.backgroundGranted);
      if (!permissionResult.granted) return;

      await service.startTracking({
        riderId: state.rider.id,
        deliveries: deliveriesRef.current.filter((item) => item.status !== "completed"),
        status: state.rider.online ? "em_rota" : "offline",
        onLocation: (location) => {
          if (!mounted) return;
          setCurrentLocation(location);
          const activeDelivery = deliveriesRef.current.find(
            (item) => item.status === "in_progress",
          );
          if (activeDelivery) {
            void pushLocationPingRef.current({
              deliveryId: activeDelivery.id,
              latitude: location.latitude,
              longitude: location.longitude,
              speed: location.speed,
              heading: location.heading,
              accuracy: location.accuracy,
              battery: location.battery,
              status: location.status,
            });
          }
        },
      });

      if (mounted) {
        setTrackingActive(true);
        setUsingMockTracking(service.isUsingMockTracking());
      }
    };

    void start();

    const mockInterval = setInterval(() => {
      if (!mounted) return;
      setUsingMockTracking(serviceRef.current.isUsingMockTracking());
    }, 3000);

    return () => {
      mounted = false;
      clearInterval(mockInterval);
      void service.stop();
    };
  }, [state.loggedIn, state.rider.id, state.rider.online]);

  const value = useMemo(
    () => ({
      currentLocation,
      routeHistory: serviceRef.current.getHistory(),
      trackingActive,
      usingMockTracking,
      permissionsGranted,
      backgroundPermissionsGranted,
      requestPermissions,
      stopTracking,
    }),
    [backgroundPermissionsGranted, currentLocation, permissionsGranted, trackingActive, usingMockTracking],
  );

  return (
    <LocationContext.Provider value={value}>
      {usingMockTracking ? (
        <View style={{ backgroundColor: "#F59E0B", paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: "#111", fontSize: 12, fontWeight: "600", textAlign: "center" }}>
            GPS simulado ativo — posicao no mapa pode nao refletir o local real.
          </Text>
        </View>
      ) : null}
      {children}
    </LocationContext.Provider>
  );
}
