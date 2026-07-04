// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { injectDeployEnv } from "./scripts/load-deploy-env.mjs";

// Mescla deploy/.env (Supabase real) — o Vite só lia .env da raiz com VITE_DEMO_MODE=true.
injectDeployEnv();

import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

const nitroPreset = (process.env.NITRO_PRESET ?? "vercel") as "vercel" | "node-server";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      port: 5173,
      strictPort: true,
      watch: {
        ignored: ["**/.vercel/**"],
      },
    },
    plugins: [
      nitro({
        preset: nitroPreset,
      }),
    ],
    ssr: {
      external: ["@brasil-fiscal/nfe", "@brasil-fiscal/core"],
    },
  },
});
