import { createFileRoute } from "@tanstack/react-router";
import { ClientAfterHydration } from "@/components/shared/client-after-hydration";
import { NorfoodLanding } from "@/components/landing/norfood-landing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NorFood — Sistema de Delivery" },
      {
        name: "description",
        content:
          "Aproveite a vida. O resto a NorFood entrega pra você. Delivery nordestino com acarajé, tapioca, moqueca e muito mais.",
      },
      { property: "og:title", content: "NorFood — Sistema de Delivery" },
      {
        property: "og:description",
        content: "Delivery nordestino arretado. Peça sem stress, acompanhe em tempo real e pague no Pix.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <ClientAfterHydration
      fallback={
        <div
          className="norfood-landing min-h-screen overflow-x-hidden bg-[#FFF8F0] text-[#1A1A1A]"
          aria-busy="true"
          suppressHydrationWarning
        />
      }
    >
      <NorfoodLanding />
    </ClientAfterHydration>
  );
}
