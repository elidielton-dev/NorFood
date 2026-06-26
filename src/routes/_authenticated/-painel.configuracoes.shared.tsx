import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import {
  ConfigBox,
  ConfigDetailCard,
  PrinterStat,
  SettingRow,
  StatusBadge,
} from "@/components/painel-configuracoes-ui";
import { GestaoButton, GestaoHeroCard, GestaoSectionTitle } from "@/components/gestao-ui";
import { getIntegrationStatus } from "@/lib/api/integrations.functions";
import {
  IntegrationKey,
  PrinterPanelKey,
  getIntegrationConfig,
  getPrinterPanelConfig,
} from "@/lib/painel-configuracoes";

export function ConfiguracaoImpressoraDetalhePage({ panelKey }: { panelKey: PrinterPanelKey }) {
  const panel = getPrinterPanelConfig(panelKey);

  if (!panel) {
    return null;
  }

  return (
    <section className="space-y-4">
      <GestaoHeroCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-sage text-primary-foreground sm:size-12 sm:rounded-2xl">
                <Printer className="size-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--gestao-gold-deep)]">
                  Painel {panel.titulo}
                </p>
                <h2 className="font-display text-2xl text-[color:var(--gestao-ink)] sm:text-3xl">
                  Configuracao separada
                </h2>
                <p className="text-sm text-muted-foreground">{panel.descricao}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <PrinterStat label="Impressora" value={panel.printerName} hint="Principal" />
              <PrinterStat label="Papel" value={panel.paper} hint="Formato ativo" />
              <PrinterStat label="Copias" value={`${panel.copies}`} hint="Por evento" />
              <PrinterStat
                label="Pre-visualizacao"
                value={panel.showPreview ? "Ativa" : "Desligada"}
                hint="Antes de imprimir"
              />
            </div>
          </div>
          <StatusBadge ativo={panel.autoPrint} ativoLabel="Auto impressao ligada" />
        </div>
      </GestaoHeroCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ConfigDetailCard title="Mais configuracoes">
          <div className="grid gap-4 sm:grid-cols-3">
            <ConfigBox label="Impressora principal" value={panel.printerName} />
            <ConfigBox label="Tamanho do papel" value={panel.paper} />
            <ConfigBox label="Numero de vias" value={`${panel.copies} copia(s)`} />
          </div>
          <div className="mt-5 space-y-3 rounded-xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/50 p-4">
            <SettingRow label="Imprimir automaticamente" enabled={panel.autoPrint} />
            <SettingRow label="Cortar papel ao finalizar" enabled={panel.cutPaper} />
            <SettingRow
              label="Exibir pre-visualizacao antes de imprimir"
              enabled={panel.showPreview}
            />
          </div>
        </ConfigDetailCard>

        <ConfigDetailCard title="Itens desta rota">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {panel.itens.map((item) => (
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
      <GestaoHeroCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-sage text-primary-foreground sm:size-12 sm:rounded-2xl">
              <integration.icon className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--gestao-gold-deep)]">
                Integracao separada
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
