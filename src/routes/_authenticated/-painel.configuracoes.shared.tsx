import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Printer, Save } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  ConfigBox,
  ConfigDetailCard,
  PrinterStat,
  SettingRow,
  StatusBadge,
} from "@/components/painel-configuracoes-ui";
import { ConfigPageBack } from "@/components/config-hub-ui";
import { GestaoButton, GestaoField, GestaoHeroCard, GestaoInput, GestaoSectionTitle } from "@/components/gestao-ui";
import { getIntegrationStatus } from "@/lib/api/integrations.functions";
import {
  fetchTenantAdminSettingsServer,
  savePrinterSettingsServer,
  type PrinterSettings,
} from "@/lib/api/tenant-settings-admin.functions";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import {
  IntegrationKey,
  PrinterPanelKey,
  getIntegrationConfig,
  getPrinterPanelConfig,
} from "@/lib/painel-configuracoes";

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
    <section className="space-y-4">
      <div className="flex justify-end">
        <ConfigPageBack />
      </div>
      <GestaoHeroCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-sage text-primary-foreground sm:size-12 sm:rounded-2xl">
                <Printer className="size-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--gestao-gold-deep)]">
                  Painel {panelDefault.titulo}
                </p>
                <h2 className="font-display text-2xl text-[color:var(--gestao-ink)] sm:text-3xl">
                  Impressora
                </h2>
                <p className="text-sm text-muted-foreground">{panelDefault.descricao}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <PrinterStat label="Impressora" value={active.printerName} hint="Principal" />
              <PrinterStat label="Papel" value={active.paper} hint="Formato" />
              <PrinterStat label="Copias" value={`${active.copies}`} hint="Por evento" />
              <PrinterStat
                label="Pre-visualizacao"
                value={active.showPreview ? "Ativa" : "Desligada"}
                hint="Antes de imprimir"
              />
            </div>
          </div>
          <StatusBadge ativo={active.autoPrint} ativoLabel="Auto impressao ligada" />
        </div>
      </GestaoHeroCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ConfigDetailCard title="Configuracao">
          <div className="grid gap-4 sm:grid-cols-2">
            <GestaoField label="Nome da impressora">
              <GestaoInput
                value={active.printerName}
                onChange={(e) => setSettings({ ...active, printerName: e.target.value })}
              />
            </GestaoField>
            <GestaoField label="Papel">
              <GestaoInput value={active.paper} onChange={(e) => setSettings({ ...active, paper: e.target.value })} />
            </GestaoField>
            <GestaoField label="Copias">
              <GestaoInput
                type="number"
                min={1}
                value={active.copies}
                onChange={(e) => setSettings({ ...active, copies: Number(e.target.value) || 1 })}
              />
            </GestaoField>
          </div>
          <div className="mt-5 space-y-3 rounded-xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Imprimir automaticamente</span>
              <Switch
                checked={active.autoPrint}
                onCheckedChange={(autoPrint) => setSettings({ ...active, autoPrint })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Cortar papel ao finalizar</span>
              <Switch
                checked={active.cutPaper}
                onCheckedChange={(cutPaper) => setSettings({ ...active, cutPaper })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Exibir pre-visualizacao</span>
              <Switch
                checked={active.showPreview}
                onCheckedChange={(showPreview) => setSettings({ ...active, showPreview })}
              />
            </div>
          </div>
          <GestaoButton className="mt-4" onClick={() => saveMutation.mutate(active)} disabled={saveMutation.isPending}>
            <Save className="size-4" />
            Salvar impressora
          </GestaoButton>
        </ConfigDetailCard>

        <ConfigDetailCard title="Itens deste painel">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {panelDefault.itens.map((item) => (
              <li key={item} className="rounded-xl bg-[color:var(--gestao-cream)]/50 px-3 py-3">
                {item}
              </li>
            ))}
          </ul>
          <Link to="/painel/configuracoes/impressoras" className="mt-5 inline-block">
            <GestaoButton variant="secondary" size="sm">
              Voltar para impressoras
            </GestaoButton>
          </Link>
        </ConfigDetailCard>
      </div>
    </section>
  );
}

export function ConfiguracaoIntegracaoDetalhePage({
  integrationKey,
}: {
  integrationKey: IntegrationKey;
}) {
  const integration = getIntegrationConfig(integrationKey);
  const { data } = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => getIntegrationStatus(),
  });

  if (!integration) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <ConfigPageBack to="/painel/configuracoes/integracoes" />
      </div>
      <GestaoHeroCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-sage text-primary-foreground sm:size-12 sm:rounded-2xl">
              <integration.icon className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--gestao-gold-deep)]">
                Integracao
              </p>
              <h2 className="font-display text-2xl text-[color:var(--gestao-ink)] sm:text-3xl">
                {integration.titulo}
              </h2>
              <p className="text-sm text-muted-foreground">{integration.descricao}</p>
            </div>
          </div>
          <StatusBadge ativo={integration.isActive(data)} />
        </div>
      </GestaoHeroCard>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <ConfigDetailCard title="Leitura da integracao">
          <div className="space-y-3 text-sm text-muted-foreground">
            {integration.details(data).map((detail) => (
              <div
                key={detail}
                className="rounded-xl bg-[color:var(--gestao-cream)]/50 px-3 py-3 text-[color:var(--gestao-ink)]"
              >
                {detail}
              </div>
            ))}
          </div>
        </ConfigDetailCard>

        <ConfigDetailCard title="Variaveis esperadas">
          <div className="flex flex-wrap gap-2">
            {integration.envs.map((envName) => (
              <code
                key={envName}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs"
              >
                {envName}
              </code>
            ))}
          </div>
          <Link to="/painel/configuracoes/integracoes" className="mt-5 inline-block">
            <GestaoButton variant="secondary" size="sm">
              Voltar para integracoes
            </GestaoButton>
          </Link>
        </ConfigDetailCard>
      </div>
    </section>
  );
}
