import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/painel/painel-configuracoes-ui";
import {

  ConfigSection,
  ConfigSettingRow,
  ConfigSwitchRow,
  ConfiguracoesPageFrame,
} from "@/components/configuracoes/configuracoes-page-frame";
import { GestaoButton, GestaoInput } from "@/components/painel/gestao-ui";
import { getIntegrationStatus } from "@/lib/api/tenant/integrations.functions";

import {
  fetchTenantAdminSettingsServer,
  savePrinterSettingsServer,
  type PrinterSettings,
} from "@/lib/api/tenant/tenant-settings-admin.functions";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import { tenantPath } from "@/lib/tenant/painel-routes";
import {
  IntegrationKey,
  PrinterPanelKey,
  getIntegrationConfig,
  getPrinterPanelConfig,
} from "@/lib/painel/painel-configuracoes";

export function ConfiguracaoImpressoraDetalhePage({ panelKey }: { panelKey: PrinterPanelKey }) {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  const panelDefault = getPrinterPanelConfig(panelKey);

  const { data } = useQuery({
    queryKey: ["tenant-admin-settings", tenantSlug],
    queryFn: () => fetchTenantAdminSettingsServer({ data: tenantSlug! }),
  });

  const [settings, setSettings] = useState<PrinterSettings | null>(null);

  useEffect(() => {
    if (data?.settings.printers[panelKey] && !settings) {
      setSettings(data.settings.printers[panelKey]!);
    }
  }, [data, panelKey, settings]);

  const saveMutation = useMutation({
    mutationFn: (payload: PrinterSettings) =>
      savePrinterSettingsServer({ data: { tenantSlug: tenantSlug!, panelKey, settings: payload } }),
    onSuccess: () => {
      toast.success("Impressora salva.");
      void qc.invalidateQueries({ queryKey: ["tenant-admin-settings", tenantSlug] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!panelDefault) return null;

  const active = settings ?? data?.settings.printers[panelKey] ?? {
    printerName: panelDefault.printerName,
    copies: panelDefault.copies,
    paper: panelDefault.paper,
    autoPrint: panelDefault.autoPrint,
    cutPaper: panelDefault.cutPaper,
    showPreview: panelDefault.showPreview,
  };

  return (
    <ConfiguracoesPageFrame
      title={`Impressora — ${panelDefault.titulo}`}
      description={panelDefault.descricao}
      actions={
        <GestaoButton onClick={() => saveMutation.mutate(active)} disabled={saveMutation.isPending}>
          <Save className="size-4" />
          Salvar
        </GestaoButton>
      }
    >
      <ConfigSection title="Equipamento" description="Nome da impressora, papel e cópias por evento.">
        <ConfigSettingRow
          description="Nome da impressora instalada neste computador ou na rede."
          control={
            <GestaoInput
              className="w-56"
              value={active.printerName}
              onChange={(e) => setSettings({ ...active, printerName: e.target.value })}
            />
          }
        />
        <ConfigSettingRow
          description="Formato do papel utilizado neste painel."
          control={
            <GestaoInput
              className="w-40"
              value={active.paper}
              onChange={(e) => setSettings({ ...active, paper: e.target.value })}
            />
          }
        />
        <ConfigSettingRow
          description="Número de cópias impressas a cada evento."
          control={
            <GestaoInput
              type="number"
              min={1}
              className="w-24"
              value={active.copies}
              onChange={(e) => setSettings({ ...active, copies: Number(e.target.value) || 1 })}
            />
          }
        />
      </ConfigSection>

      <ConfigSection title="Comportamento" description="Autoimpressão, corte e pré-visualização.">
        <ConfigSwitchRow
          description="Envia o pedido para a impressora assim que o evento ocorre neste painel."
          label="Imprimir automaticamente"
          checked={active.autoPrint}
          onCheckedChange={(autoPrint) => setSettings({ ...active, autoPrint })}
        />
        <ConfigSwitchRow
          description="Aciona o corte automático da bobina ao finalizar cada impressão."
          label="Cortar papel ao finalizar"
          checked={active.cutPaper}
          onCheckedChange={(cutPaper) => setSettings({ ...active, cutPaper })}
        />
        <ConfigSwitchRow
          description="Mostra uma pré-visualização antes de confirmar a impressão."
          label="Exibir pré-visualização"
          checked={active.showPreview}
          onCheckedChange={(showPreview) => setSettings({ ...active, showPreview })}
        />
      </ConfigSection>

      <ConfigSection title="Itens deste painel" description="Documentos impressos nesta área.">
        <ul className="space-y-2 text-sm text-[#4B5563]">
          {panelDefault.itens.map((item) => (
            <li key={item} className="rounded-lg bg-[#F9FAFB] px-3 py-2.5">
              {item}
            </li>
          ))}
        </ul>
        <Link
          to={tenantPath(tenantSlug, "configuracoes/impressoras")}
          className="mt-4 inline-block text-sm font-medium text-[var(--tenant-primary,#FF7A00)] hover:underline"
        >
          Voltar para impressoras
        </Link>
      </ConfigSection>
    </ConfiguracoesPageFrame>
  );
}

export function ConfiguracaoIntegracaoDetalhePage({
  integrationKey,
}: {
  integrationKey: IntegrationKey;
}) {
  const integration = getIntegrationConfig(integrationKey);
  const tenantSlug = useTenantSlug();
  const { data, isLoading } = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => getIntegrationStatus(),
  });

  if (!integration) {
    return null;
  }

  return (
    <ConfiguracoesPageFrame
      title={integration.titulo}
      description={integration.descricao}
      actions={<StatusBadge ativo={integration.isActive(data)} />}
    >
      <ConfigSection title="Status da integração" description="Leitura atual das credenciais e conexão.">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-2">
            {integration.details(data).map((detail) => (
              <p key={detail} className="rounded-lg bg-[#F9FAFB] px-3 py-2.5 text-sm text-[#374151]">
                {detail}
              </p>
            ))}
          </div>
        )}
      </ConfigSection>

      <ConfigSection
        title="Variáveis de ambiente"
        description="Chaves esperadas no servidor para ativar esta integração."
      >
        <div className="flex flex-wrap gap-2">
          {integration.envs.map((envName) => (
            <code
              key={envName}
              className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs text-[#374151]"
            >
              {envName}
            </code>
          ))}
        </div>
        <Link
          to={tenantPath(tenantSlug, "configuracoes/integracoes")}
          className="mt-4 inline-block text-sm font-medium text-[var(--tenant-primary,#FF7A00)] hover:underline"
        >
          Voltar para integrações
        </Link>
      </ConfigSection>
    </ConfiguracoesPageFrame>
  );
}
