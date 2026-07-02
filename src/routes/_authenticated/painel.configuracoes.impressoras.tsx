import { createFileRoute, Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { PrinterStat, SettingRow, StatusBadge } from "@/components/painel-configuracoes-ui";
import {
  GestaoHeroCard,
  GestaoInteractiveCard,
  GestaoPage,
  GestaoSectionTitle,
} from "@/components/gestao-ui";
import { ConfigPageBack } from "@/components/config-hub-ui";
import { printerPanels } from "@/lib/painel-configuracoes";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/impressoras")({
  component: ConfiguracoesImpressorasPage,
});

function ConfiguracoesImpressorasPage() {
  return (
    <GestaoPage
      title="Impressao"
      subtitle="Impressoras e regras de comprovantes por painel."
      actions={<ConfigPageBack />}
    >
      <section className="space-y-4">
        <GestaoHeroCard>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-xl bg-sage text-primary-foreground sm:size-12 sm:rounded-2xl">
                  <Printer className="size-5" />
                </div>
                <GestaoSectionTitle
                  title="Configuracao de impressoras"
                  description="Area global com acesso separado por painel."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <PrinterStat label="Impressao direta" value="Ativa" hint="Pedidos e recibos" />
                <PrinterStat label="Painel padrao" value="KDS" hint="Fluxo inicial" />
                <PrinterStat label="Modo de corte" value="Automatico" hint="Bobina termica" />
                <PrinterStat
                  label="Pre-visualizacao"
                  value="Seletiva"
                  hint="Somente onde precisa"
                />
              </div>
            </div>

            <div className="w-full max-w-[340px] rounded-xl border border-[color:var(--honey-line)] bg-card/90 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--gestao-gold-deep)]">
                Imprimir direto
              </p>
              <div className="mt-4 space-y-3">
                <SettingRow label="Pedidos novos" enabled />
                <SettingRow label="Recibos operacionais" enabled />
                <SettingRow label="Comprovantes fiscais" enabled={false} />
                <SettingRow label="Pre-visualizacao global" enabled={false} />
              </div>
            </div>
          </div>
        </GestaoHeroCard>

        <div className="grid gap-4 xl:grid-cols-2">
          {printerPanels.map((panel) => (
            <Link key={panel.key} to={panel.route} className="block">
              <GestaoInteractiveCard>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl text-[color:var(--gestao-ink)] sm:text-2xl">
                      {panel.titulo}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{panel.descricao}</p>
                  </div>
                  <StatusBadge ativo={panel.autoPrint} ativoLabel="Auto impressao" />
                </div>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--gestao-gold-deep)]">
                  Abrir rota individual
                </p>
              </GestaoInteractiveCard>
            </Link>
          ))}
        </div>
      </section>
    </GestaoPage>
  );
}
