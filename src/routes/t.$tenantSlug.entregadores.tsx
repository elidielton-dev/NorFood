import { createFileRoute, Link } from "@tanstack/react-router";
import { EntregadorExpoGoQrPanel } from "@/components/entregador/entregador-expo-go-qr";
import { TenantBrandLogo } from "@/components/brand/norfood-logo";
import { useTenant } from "@/lib/tenant/tenant-context";

export const Route = createFileRoute("/t/$tenantSlug/entregadores")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "App Entregador — Expo Go" },
      { name: "description", content: "Escaneie o QR Code para abrir o app do entregador no Expo Go." },
    ],
  }),
  component: TenantEntregadoresExpoPage,
});

function TenantEntregadoresExpoPage() {
  const { tenant } = useTenant();

  return (
    <div className="min-h-screen bg-[#F6F7F9] px-4 py-8">
      <div className="mx-auto flex max-w-lg flex-col items-center">
        <TenantBrandLogo
          logoUrl={tenant.logo_url}
          name={tenant.name}
          primaryColor={tenant.primary_color}
          size="md"
        />
        <h1 className="text-center text-2xl font-bold text-[#111111]">App do Entregador</h1>
        <p className="mt-2 text-center text-sm text-[#6B7280]">
          Escaneie o QR Code com o <strong>Expo Go</strong> e faça login com seu e-mail de entregador.
        </p>
        <EntregadorExpoGoQrPanel className="mt-6 w-full" />
        <p className="mt-6 text-center text-xs text-[#9CA3AF]">
          Gerencia de entregas no painel?{" "}
          <Link to="/login" search={{ redirect: `/t/${tenant.slug}/delivery` }} className="font-semibold text-[#FF7A00]">
            Entrar no painel
          </Link>
        </p>
      </div>
    </div>
  );
}
