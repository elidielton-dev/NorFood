import { createFileRoute } from "@tanstack/react-router";
import { EntregadorGate } from "@/components/entregador-gate";

export const Route = createFileRoute("/entregador")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entregador — Norfood" },
      { name: "description", content: "App do entregador Norfood." },
      { name: "theme-color", content: "#3d5a40" },
    ],
  }),
  component: EntregadorGate,
});
