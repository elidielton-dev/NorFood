import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bike } from "lucide-react";
import {
  ConfigSection,
  ConfigSettingRow,
  ConfiguracoesPageFrame,
} from "@/components/configuracoes/configuracoes-page-frame";
import { EntregadorExpoGoQrPanel } from "@/components/entregador/entregador-expo-go-qr";
import { fetchOperationalAdminServer } from "@/lib/api/tenant/operational-config.functions";
import { fetchTenantAdminSettingsServer } from "@/lib/api/tenant/tenant-settings-admin.functions";
import { tenantPath } from "@/lib/tenant/painel-routes";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import { GestaoButton } from "@/components/painel/gestao-ui";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/delivery")({
  component: ConfiguracoesDeliveryPage,
});

function ConfiguracoesDeliveryPage() {
  const tenantSlug = useTenantSlug();

  const { data: tenantSettings, isLoading: loadingSettings } = useQuery({
    queryKey: ["tenant-admin-settings", tenantSlug],
    queryFn: () => fetchTenantAdminSettingsServer({ data: tenantSlug! }),
  });

  const { data: operacao, isLoading: loadingOperacao } = useQuery({
    queryKey: ["operational-admin", tenantSlug],
    queryFn: () => fetchOperationalAdminServer({ data: tenantSlug! }),
  });

  const isLoading = loadingSettings || loadingOperacao;

  return (
    <ConfiguracoesPageFrame
      title="Configurações de delivery"
      description="Tempo de entrega, taxas, bairros e app do entregador."
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <ConfigSection title="Resumo" description="Indicadores atuais do delivery.">
            <ConfigSettingRow
              description="Tempo estimado exibido na loja online para o cliente."
              control={
                <span className="text-sm font-semibold text-[#111111]">
                  {tenantSettings?.settings.delivery_time_minutes ?? "—"} min
                </span>
              }
            />
            <ConfigSettingRow
              description="Taxa aplicada quando o bairro do cliente não possui taxa própria."
              control={
                <span className="text-sm font-semibold text-[#111111]">
                  {operacao?.config
                    ? `R$ ${Number(operacao.config.valor_padrao_entrega).toFixed(2)}`
                    : "—"}
                </span>
              }
            />
            <ConfigSettingRow
              description="Quantidade de bairros cadastrados para entrega."
              control={
                <span className="text-sm font-semibold text-[#111111]">
                  {operacao?.bairros?.length ?? 0}
                </span>
              }
            />
            <div className="border-t border-[#F3F4F6] pt-4">
              <Link to={tenantPath(tenantSlug, "configuracoes/operacao")}>
                <GestaoButton variant="secondary" size="sm">
                  Abrir operação e bairros
                </GestaoButton>
              </Link>
            </div>
          </ConfigSection>

          <ConfigSection
            title="App do entregador (Expo Go)"
            description="QR Code para motoboys instalarem o app de entregas."
          >
            <EntregadorExpoGoQrPanel />
            <div className="mt-4 border-t border-[#F3F4F6] pt-4">
              <Link to={tenantPath(tenantSlug, "delivery")}>
                <GestaoButton variant="secondary">
                  <Bike className="size-4" />
                  Ir para painel de entregadores
                </GestaoButton>
              </Link>
            </div>
          </ConfigSection>
        </>
      )}
    </ConfiguracoesPageFrame>
  );
}
