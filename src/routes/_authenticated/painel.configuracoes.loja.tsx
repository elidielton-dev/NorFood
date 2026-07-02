import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import {
  ConfigSection,
  ConfigSettingRow,
  ConfiguracoesPageFrame,
} from "@/components/configuracoes/configuracoes-page-frame";
import { fetchTenantAdminSettingsServer } from "@/lib/api/tenant-settings-admin.functions";
import { lojaPath } from "@/lib/tenant/painel-routes";
import { useTenant, useTenantSlug } from "@/lib/tenant/tenant-context";
import { GestaoAlert, GestaoButton } from "@/components/gestao-ui";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/loja")({
  component: ConfiguracoesLojaPage,
});

function displayValue(value: string | number | null | undefined, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function ConfiguracoesLojaPage() {
  const { tenant: ctxTenant } = useTenant();
  const tenantSlug = useTenantSlug();

  const { data, isLoading } = useQuery({
    queryKey: ["tenant-admin-settings", tenantSlug],
    queryFn: () => fetchTenantAdminSettingsServer({ data: tenantSlug! }),
  });

  if (isLoading || !data) {
    return (
      <ConfiguracoesPageFrame title="Dados e aparência" description="Carregando...">
        <p className="text-sm text-muted-foreground">Carregando configurações...</p>
      </ConfiguracoesPageFrame>
    );
  }

  const lojaUrl = lojaPath(ctxTenant.slug);
  const { tenant, settings } = data;

  return (
    <ConfiguracoesPageFrame
      title="Dados e aparência"
      description="Informações cadastrais da loja. Para alterar, entre em contato com o suporte Norfood."
      actions={
        <a href={lojaUrl} target="_blank" rel="noreferrer">
          <GestaoButton variant="secondary">
            <ExternalLink className="size-4" />
            Ver loja
          </GestaoButton>
        </a>
      }
    >
      <GestaoAlert tone="info">
        Os dados abaixo são exibidos apenas para consulta. Alterações de nome, logo e vitrine são
        feitas pela equipe Norfood.
      </GestaoAlert>

      <ConfigSection title="Identidade da loja" description="Nome e marca exibidos no painel e na vitrine.">
        <ConfigSettingRow
          description="Nome do restaurante."
          control={<span className="text-sm font-medium text-[#111111]">{displayValue(tenant.name)}</span>}
        />
        <ConfigSettingRow
          description="Subtítulo exibido abaixo do nome."
          control={<span className="text-sm font-medium text-[#111111]">{displayValue(tenant.subtitle)}</span>}
        />
        <ConfigSettingRow
          description="Logo da loja."
          control={
            tenant.logo_url ? (
              <img src={tenant.logo_url} alt="Logo" className="h-12 w-auto max-w-[180px] object-contain" />
            ) : (
              <span className="text-sm text-[#6B7280]">—</span>
            )
          }
        />
        {settings.appearance.tagline ? (
          <ConfigSettingRow
            description="Frase de destaque na vitrine."
            control={
              <span className="max-w-xs text-right text-sm font-medium text-[#111111]">
                {settings.appearance.tagline}
              </span>
            }
          />
        ) : null}
      </ConfigSection>

      <ConfigSection title="Contato e operação" description="Informações da vitrine e do delivery.">
        <ConfigSettingRow
          description="Telefone ou WhatsApp de contato."
          control={<span className="text-sm font-medium text-[#111111]">{displayValue(settings.phone)}</span>}
        />
        <ConfigSettingRow
          description="Endereço do estabelecimento."
          control={
            <span className="max-w-xs text-right text-sm font-medium text-[#111111]">
              {displayValue(settings.address)}
            </span>
          }
        />
        <ConfigSettingRow
          description="Tempo médio de entrega exibido na loja online."
          control={
            <span className="text-sm font-medium text-[#111111]">
              {displayValue(settings.delivery_time_minutes)} min
            </span>
          }
        />
        <ConfigSettingRow
          description="Descrição da loja na vitrine."
          control={
            <span className="max-w-sm text-right text-sm text-[#374151]">
              {displayValue(settings.description)}
            </span>
          }
        />
      </ConfigSection>
    </ConfiguracoesPageFrame>
  );
}
