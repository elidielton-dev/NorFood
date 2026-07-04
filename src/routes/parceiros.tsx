import { createFileRoute } from "@tanstack/react-router";
import { NorfoodParceirosLanding } from "@/components/landing/norfood-parceiros-landing";

export const Route = createFileRoute("/parceiros")({
  head: () => ({
    meta: [
      { title: "Seja um parceiro NorFood — Programa de Hiperadores" },
      {
        name: "description",
        content:
          "Amplie seu negócio com receita recorrente. Programa de parceiros NorFood para revendas, consultores e representantes de software para restaurantes.",
      },
      { property: "og:title", content: "Seja um parceiro NorFood" },
      {
        property: "og:description",
        content:
          "Receita recorrente, portal parceiro completo e suporte na implantação de restaurantes em todo o Brasil.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: ParceirosPage,
});

function ParceirosPage() {
  return <NorfoodParceirosLanding />;
}
