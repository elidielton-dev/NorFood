import { createFileRoute, Link } from "@tanstack/react-router";

import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/painel/painel-configuracoes-ui";
import {
  ConfigSection,
  ConfigSwitchRow,
  ConfiguracoesPageFrame,
} from "@/components/configuracoes/configuracoes-page-frame";
import { printerPanels } from "@/lib/painel/painel-configuracoes";


export const Route = createFileRoute("/_authenticated/painel/configuracoes/impressoras")({
  component: ConfiguracoesImpressorasPage,
});

function ConfiguracoesImpressorasPage() {
  return (
    <ConfiguracoesPageFrame
      title="Impressão"
      description="Impressoras e regras de comprovantes por painel."
    >
      <ConfigSection
        title="Impressão direta"
        description="Regras globais de impressão automática no restaurante."
      >
        <ConfigSwitchRow
          description="Imprime automaticamente novos pedidos assim que entram no fluxo."
          label="Pedidos novos"
          checked
          onCheckedChange={() => undefined}
          disabled
        />
        <ConfigSwitchRow
          description="Emite recibos operacionais para conferência da equipe."
          label="Recibos operacionais"
          checked
          onCheckedChange={() => undefined}
          disabled
        />
        <ConfigSwitchRow
          description="Envia comprovantes fiscais para a impressora configurada."
          label="Comprovantes fiscais"
          checked={false}
          onCheckedChange={() => undefined}
          disabled
        />
        <ConfigSwitchRow
          description="Exibe pré-visualização antes de cada impressão."
          label="Pré-visualização global"
          checked={false}
          onCheckedChange={() => undefined}
          disabled
        />
      </ConfigSection>

      <ConfigSection
        title="Impressoras por painel"
        description="Configure impressora, papel e autoimpressão de cada área."
      >
        <div className="divide-y divide-[#F3F4F6]">
          {printerPanels.map((panel) => (
            <Link
              key={panel.key}
              to={panel.route}
              className="flex items-center gap-4 py-4 transition hover:bg-[#FAFAFA] -mx-2 px-2 rounded-lg"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-[#1F2937]">{panel.titulo}</p>
                  <StatusBadge ativo={panel.autoPrint} ativoLabel="Auto impressão" />
                </div>
                <p className="mt-0.5 text-sm text-[#6B7280]">{panel.descricao}</p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-[#9CA3AF]" />
            </Link>
          ))}
        </div>
      </ConfigSection>
    </ConfiguracoesPageFrame>
  );
}
