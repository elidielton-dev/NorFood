import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bike, MapPinned, QrCode } from "lucide-react";
import { ConfigPageBack } from "@/components/config-hub-ui";
import { EntregadorExpoGoQrPanel } from "@/components/entregador-expo-go-qr";
import { fetchOperationalAdminServer } from "@/lib/api/operational-config.functions";
import { fetchTenantAdminSettingsServer } from "@/lib/api/tenant-settings-admin.functions";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import {
  GestaoButton,
  GestaoCard,
  GestaoPage,
  GestaoSectionTitle,
  GestaoStat,
} from "@/components/gestao-ui";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/delivery")({
  component: ConfiguracoesDeliveryPage,
});

function ConfiguracoesDeliveryPage() {
  const tenantSlug = useTenantSlug();

  const { data: tenantSettings } = useQuery({
    queryKey: ["tenant-admin-settings", tenantSlug],
    queryFn: () => fetchTenantAdminSettingsServer({ data: tenantSlug! }),
  });

  const { data: operacao } = useQuery({
    queryKey: ["operational-admin", tenantSlug],
    queryFn: () => fetchOperationalAdminServer({ data: tenantSlug! }),
  });

  return (
    <GestaoPage
      title="Configurações de delivery"
      subtitle="Tempo de entrega, taxas, bairros e app do entregador."
      actions={<ConfigPageBack />}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <GestaoStat
          label="Tempo estimado"
          value={`${tenantSettings?.settings.delivery_time_minutes ?? "—"} min`}
          hint="Exibido na loja"
        />
        <GestaoStat
          label="Taxa padrão"
          value={
            operacao?.config
              ? `R$ ${Number(operacao.config.valor_padrao_entrega).toFixed(2)}`
              : "—"
          }
          hint="Quando bairro não tem taxa"
        />
        <GestaoStat
          label="Bairros"
          value={`${operacao?.bairros?.length ?? 0}`}
          hint="Áreas atendidas"
        />
      </div>

      <GestaoCard>
        <GestaoSectionTitle
          title="Operação e taxas"
          description="Pedido mínimo, bairros e taxas de entrega."
          action={<MapPinned className="size-5 text-sage" />}
        />
        <p className="mt-3 text-sm text-muted-foreground">
          Taxas por bairro, pedido mínimo e valor padrão de entrega ficam em Operação e delivery.
        </p>
        <Link to="/painel/configuracoes/operacao" className="mt-4 inline-block">
          <GestaoButton variant="secondary">Abrir operação e bairros</GestaoButton>
        </Link>
      </GestaoCard>

      <GestaoCard>
        <GestaoSectionTitle
          title="App do entregador (Expo Go)"
          description="QR Code para motoboys instalarem o app de entregas."
          action={<QrCode className="size-5 text-sage" />}
        />
        <div className="mt-4">
          <EntregadorExpoGoQrPanel />
        </div>
        <Link to="/painel/delivery" className="mt-4 inline-block">
          <GestaoButton variant="secondary">
            <Bike className="size-4" />
            Ir para painel de entregadores
          </GestaoButton>
        </Link>
      </GestaoCard>
    </GestaoPage>
  );
}
