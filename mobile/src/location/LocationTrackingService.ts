import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { SERVICE_CITY_CONFIG } from "../lib/city-config";
import { mobileSupabase, mobileSupabaseEnabled } from "../lib/supabase";
import type { DeliveryOrder, RiderRealtimeLocation } from "../types";

type LocationListener = (location: RiderRealtimeLocation) => void;

type StartTrackingOptions = {
  riderId: string;
  deliveries: DeliveryOrder[];
  status: RiderRealtimeLocation["status"];
  onLocation: LocationListener;
};

type TrackerHandle = {
  stop: () => Promise<void>;
};

type PermissionResult = {
  foreground: Location.LocationPermissionResponse;
  background: Location.PermissionResponse | null;
  granted: boolean;
  backgroundGranted: boolean;
};

export class LocationTrackingService {
  private watcher: Location.LocationSubscription | null = null;
  private mockTimer: ReturnType<typeof setInterval> | null = null;
  private history: RiderRealtimeLocation[] = [];

  async requestPermissions(): Promise<PermissionResult> {
    const foreground = await Location.requestForegroundPermissionsAsync();
    let background: Location.PermissionResponse | null = null;

    if (Platform.OS !== "web") {
      try {
        background = await Location.requestBackgroundPermissionsAsync();
      } catch {
        background = null;
      }
    }

    return {
      foreground,
      background,
      granted: foreground.status === "granted",
      backgroundGranted: Platform.OS === "web" || background?.status === "granted",
    };
  }

  async startTracking(options: StartTrackingOptions): Promise<TrackerHandle> {
    await this.stop();

    if (mobileSupabaseEnabled()) {
      try {
        const batteryLevel = await getBatteryPercentage();
        const current = await getFreshLocation();
        const firstLocation = mapExpoLocation(current, options.status, batteryLevel);
        await this.persistLocation(options.riderId, firstLocation);
        this.pushLocation(firstLocation, options.onLocation);

        this.watcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 5000,
            distanceInterval: 20,
            mayShowUserSettingsDialog: true,
          },
          async (position) => {
            try {
              const liveBattery = await getBatteryPercentage();
              const next = mapExpoLocation(position, options.status, liveBattery);
              await this.persistLocation(options.riderId, next);
              this.pushLocation(next, options.onLocation);
            } catch (error) {
              console.warn("[mobile] Falha ao atualizar localizacao em tempo real.", error);
            }
          },
        );
      } catch (error) {
        console.warn(
          "[mobile] Falha ao iniciar rastreamento real. Mantendo app ativo sem interromper a sessao.",
          error,
        );
      }
    } else {
      this.startMockTracking(options);
    }

    return {
      stop: async () => {
        await this.stop();
      },
    };
  }

  getHistory() {
    return this.history;
  }

  async stop() {
    if (this.watcher) {
      this.watcher.remove();
      this.watcher = null;
    }
    if (this.mockTimer) {
      clearInterval(this.mockTimer);
      this.mockTimer = null;
    }
  }

  private pushLocation(location: RiderRealtimeLocation, onLocation: LocationListener) {
    this.history = [...this.history.slice(-119), location];
    onLocation(location);
  }

  private async persistLocation(riderId: string, location: RiderRealtimeLocation) {
    if (!mobileSupabase) return;

    try {
      const { error } = await mobileSupabase.from("entregadores_localizacao").upsert(
        {
          entregador_id: riderId,
          latitude: location.latitude,
          longitude: location.longitude,
          speed: location.speed,
          heading: location.heading,
          accuracy: location.accuracy,
          battery: location.battery,
          status: location.status,
          updated_at: location.updatedAt,
        },
        {
          onConflict: "entregador_id",
        },
      );

      if (error) {
        console.warn("Falha ao persistir localizacao do entregador no Supabase", error.message);
      }
    } catch (error) {
      console.warn("[mobile] Erro de rede ao persistir localizacao do entregador.", error);
    }
  }

  private startMockTracking(options: StartTrackingOptions) {
    const path = buildMockPath(options.deliveries);
    let cursor = 0;

    const emit = () => {
      const current = path[cursor] ?? path[path.length - 1];
      const previous = path[Math.max(cursor - 1, 0)] ?? current;
      const location: RiderRealtimeLocation = {
        latitude: current.latitude,
        longitude: current.longitude,
        speed: 7.2,
        heading: getHeading(previous, current),
        accuracy: 9,
        battery: 82,
        status: options.status,
        updatedAt: new Date().toISOString(),
      };

      this.pushLocation(location, options.onLocation);
      cursor = (cursor + 1) % path.length;
    };

    emit();
    this.mockTimer = setInterval(emit, 5000);
  }
}

function mapExpoLocation(
  position: Location.LocationObject,
  status: RiderRealtimeLocation["status"],
  battery: number | null,
): RiderRealtimeLocation {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    speed: position.coords.speed ?? null,
    heading: position.coords.heading ?? null,
    accuracy: position.coords.accuracy ?? null,
    battery,
    status,
    updatedAt: new Date(position.timestamp).toISOString(),
  };
}

async function getFreshLocation() {
  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
  } catch (error) {
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 60_000,
      requiredAccuracy: 100,
    });
    if (lastKnown) return lastKnown;
    throw error;
  }
}

async function getBatteryPercentage() {
  try {
    const level = await Battery.getBatteryLevelAsync();
    return Math.round(level * 100);
  } catch {
    return null;
  }
}

function buildMockPath(deliveries: DeliveryOrder[]) {
  const start = {
    latitude: SERVICE_CITY_CONFIG.center.latitude,
    longitude: SERVICE_CITY_CONFIG.center.longitude,
  };
  const checkpoints = deliveries
    .sort((a, b) => (a.orderInRoute ?? 99) - (b.orderInRoute ?? 99))
    .map((delivery, index) => ({
      latitude: delivery.customerLatitude ?? start.latitude - 0.004 - index * 0.0016,
      longitude: delivery.customerLongitude ?? start.longitude + 0.004 + index * 0.0013,
    }));

  const route = [start, ...checkpoints];
  const output: Array<{ latitude: number; longitude: number }> = [];
  route.forEach((point, index) => {
    if (index === route.length - 1) return;
    const next = route[index + 1];
    for (let step = 0; step <= 10; step += 1) {
      const ratio = step / 10;
      output.push({
        latitude: point.latitude + (next.latitude - point.latitude) * ratio,
        longitude: point.longitude + (next.longitude - point.longitude) * ratio,
      });
    }
  });

  return output.length ? output : [start];
}

function getHeading(
  previous: { latitude: number; longitude: number },
  current: { latitude: number; longitude: number },
) {
  const dLon = current.longitude - previous.longitude;
  const dLat = current.latitude - previous.latitude;
  return (Math.atan2(dLon, dLat) * 180) / Math.PI;
}
