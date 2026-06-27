import { createFileRoute } from "@tanstack/react-router";
import { resolveExpoGoUrl } from "@/lib/entregador-expo-go-url";

export const Route = createFileRoute("/api/entregador/expo-go-url")({
  server: {
    handlers: {
      GET: async () => {
        const url = resolveExpoGoUrl({
          expoGoUrl: process.env.EXPO_GO_URL ?? process.env.VITE_EXPO_GO_URL,
          metroHost: process.env.EXPO_METRO_HOST,
          metroPort: process.env.EXPO_METRO_PORT,
        });

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
