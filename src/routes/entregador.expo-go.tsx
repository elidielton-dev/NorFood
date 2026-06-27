import { createFileRoute, Link } from "@tanstack/react-router";
import { EntregadorExpoGoQrPanel } from "@/components/entregador-expo-go-qr";
import logo from "@/assets/logo-norfood.png";

export const Route = createFileRoute("/entregador/expo-go")({
  ssr: false,
  head: () => ({
    meta: [{ title: "App Entregador — Expo Go" }],
  }),
  component: EntregadorExpoGoPublicPage,
});

function EntregadorExpoGoPublicPage() {
  return (
    <div className="min-h-screen bg-[#F6F7F9] px-4 py-8">
      <div className="mx-auto flex max-w-lg flex-col items-center">
        <img src={logo} alt="NorFood" className="mb-6 h-14 w-auto object-contain" />
        <h1 className="text-center text-2xl font-bold text-[#111111]">App do Entregador</h1>
        <p className="mt-2 text-center text-sm text-[#6B7280]">
          Escaneie o QR Code com o <strong>Expo Go</strong> e faça login com seu e-mail de entregador.
        </p>
        <EntregadorExpoGoQrPanel className="mt-6 w-full" />
        <p className="mt-6 text-center text-xs text-[#9CA3AF]">
          <Link to="/entregador" className="font-semibold text-[#FF7A00]">
            Abrir versao web do entregador
          </Link>
        </p>
      </div>
    </div>
  );
}
