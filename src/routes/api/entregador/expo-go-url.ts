import { createFileRoute } from "@tanstack/react-router";
import { readFileSync, existsSync } from "node:fs";
import { resolveExpoGoUrlForServer } from "@/lib/expo-metro-url.server";

function readTunnelUrlFile() {
  const path = process.env.EXPO_URL_FILE ?? "/data/expo-go-url.txt";
  try {
    if (!existsSync(path)) return null;
    const url = readFileSync(path, "utf8").trim();
    return url || null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/entregador/expo-go-url")({
  server: {
    handlers: {
      GET: async () => {
        const url = await resolveExpoGoUrlForServer({
          fileUrl: readTunnelUrlFile(),
          configuredUrl: process.env.EXPO_GO_URL ?? process.env.VITE_EXPO_GO_URL,
          metroHost: process.env.EXPO_METRO_HOST,
          metroPort: process.env.EXPO_METRO_PORT,
        });

        if (!url) {
          return new Response(
            JSON.stringify({
              error: "Metro do Expo Go indisponível. Aguarde o serviço iniciar na VPS.",
            }),
            {
              status: 503,
              headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
              },
            },
          );
        }

        const body = {
          url,
          type: "expo-go" as const,
          instructions: [
            "Instale o app Expo Go no celular.",
            "Escaneie o QR Code com o Expo Go (nao use a camera comum).",
            "Faca login com e-mail e senha do entregador.",
          ],
        };

        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
