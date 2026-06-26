import { createFileRoute } from "@tanstack/react-router";
import { AppAbelhaMel } from "@/components/app-abelha-mel";

/**
 * Cardapio QR Code: cliente escaneia o QR da mesa e pede direto da mesa.
 */
export const Route = createFileRoute("/cardapio/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Cardápio QR — NorFood" },
      { name: "description", content: "Faca seu pedido direto da mesa." },
    ],
  }),
  component: CardapioMesaPage,
});

function CardapioMesaPage() {
  const { token } = Route.useParams();
  return <AppAbelhaMel mesaToken={token} menuSourceLabel="mesa" />;
}
