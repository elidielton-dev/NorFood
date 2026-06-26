export type BrowserDeviceLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
};

type GeolocationAttemptOptions = {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
};

function ensureGeolocationSupport() {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    throw new Error("Este aparelho ou navegador nao suporta localizacao.");
  }
}

export async function requestBrowserDeviceLocation() {
  ensureGeolocationSupport();

  try {
    return await getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 25000,
      maximumAge: 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (message.includes("Ative a localizacao") || message.includes("nao suporta localizacao")) {
      throw error;
    }

    try {
      return await watchPositionOnce({
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0,
      });
    } catch {
      return await getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 45000,
        maximumAge: 180000,
      });
    }
  }
}

async function getCurrentPosition(options: GeolocationAttemptOptions) {
  return await new Promise<BrowserDeviceLocation>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          capturedAt: new Date(position.timestamp).toISOString(),
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(
            new Error("Ative a localizacao do aparelho para enviar a posicao exata ao entregador."),
          );
          return;
        }
        if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new Error("Nao foi possivel obter a localizacao atual do aparelho."));
          return;
        }
        if (error.code === error.TIMEOUT) {
          reject(
            new Error(
              "A localizacao demorou para responder. Confira se o GPS esta ativo e tente novamente.",
            ),
          );
          return;
        }
        reject(new Error("Falha ao capturar a localizacao do aparelho."));
      },
      options,
    );
  });
}

async function watchPositionOnce(options: GeolocationAttemptOptions) {
  return await new Promise<BrowserDeviceLocation>((resolve, reject) => {
    let watchId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      reject(
        new Error(
          "A localizacao demorou para responder. Confira se o GPS esta ativo e tente novamente.",
        ),
      );
    }, options.timeout);

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        window.clearTimeout(timeoutId);
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          capturedAt: new Date(position.timestamp).toISOString(),
        });
      },
      (error) => {
        window.clearTimeout(timeoutId);
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
        if (error.code === error.PERMISSION_DENIED) {
          reject(
            new Error("Ative a localizacao do aparelho para enviar a posicao exata ao entregador."),
          );
          return;
        }
        reject(new Error("Nao foi possivel obter a localizacao atual do aparelho."));
      },
      options,
    );
  });
}
