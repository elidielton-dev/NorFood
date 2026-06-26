import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Send, Settings2 } from "lucide-react";
import { FiscalNotasPanel } from "@/components/fiscal-notas-panel";
import { getIntegrationStatus } from "@/lib/api/integrations.functions";
import { fetchFiscalSettingsServer, fetchNotasFiscaisServer } from "@/lib/api/fiscal.functions";
import type { NotaFiscalRow } from "@/lib/fiscal/fiscal-nota-utils";
import { GestaoAlert, GestaoCard, GestaoPage } from "@/components/gestao-ui";

export const Route = createFileRoute("/_authenticated/painel/fiscal/")({
  component: FiscalIndexPage,
});

function FiscalIndexPage() {
  const { data: integrations } = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => getIntegrationStatus(),
  });
  const { data: fiscalSettings } = useQuery({
    queryKey: ["fiscal-settings"],
    queryFn: () => fetchFiscalSettingsServer(),
    retry: false,
  });
  const { data: notas = [] } = useQuery({
    queryKey: ["notas-fiscais"],
    queryFn: () => fetchNotasFiscaisServer(),
  });

  const readiness = fiscalSettings?.readiness;

  return (
    <GestaoPage title="Fiscal" subtitle="NFC-e, NF-e e operacoes SEFAZ">
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          to="/painel/fiscal/configuracoes"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sage px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95"
        >
          <Settings2 className="size-4" />
          Configuracoes fiscais
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FeatureCard
          icon={<FileText className="size-5 text-sage" />}
          titulo="Emissao NFC-e/NF-e"
          desc="Emissao direta SEFAZ PE + certificado A1 criptografado"
        />
        <FeatureCard
          icon={<Send className="size-5 text-gold" />}
          titulo="Cancelamento e status"
          desc="Consulte protocolo, cancele notas e inutilize numeracao"
        />
        <FeatureCard
          icon={<Download className="size-5 text-sage" />}
          titulo="SEFAZ"
          desc="Homologacao e producao com CSC e serie configuraveis"
        />
      </div>

      <GestaoAlert tone={readiness?.certificadoValido ? "success" : "info"}>
        <p className="font-medium mb-2">Status da integracao fiscal</p>
        <p className="text-muted-foreground mb-3">
          Provider:{" "}
          <strong className="text-foreground uppercase">
            {integrations?.fiscal.provider ?? "SEFAZ"}
          </strong>{" "}
          · Ambiente:{" "}
          <strong className="text-foreground">
            {fiscalSettings?.config.ambiente === "producao" ? "Producao" : "Homologacao"}
          </strong>
          · NFC-e:{" "}
          <strong className="text-foreground">
            {fiscalSettings?.config.nfceHabilitada ? "habilitada" : "desabilitada"}
          </strong>
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
          <li>
            {readiness?.sefazDireto
              ? "Integracao direta SEFAZ pronta (certificado + CSC + ENCRYPTION_KEY)"
              : "Configure certificado A1, CSC e ENCRYPTION_KEY no servidor"}
          </li>
          <li>
            {fiscalSettings?.config.certificado.instalado
              ? `Certificado: ${fiscalSettings.config.certificado.titular}`
              : "Certificado A1 nao instalado — configure em Configuracoes fiscais"}
          </li>
          {readiness && readiness.camposPendentes.length > 0 && (
            <li className="text-amber-800">
              Pendencias: {readiness.camposPendentes.length} item(ns)
            </li>
          )}
        </ul>
      </GestaoAlert>

      <FiscalNotasPanel
        notas={notas as NotaFiscalRow[]}
        seriePadrao={fiscalSettings?.config.serieNfce ?? 1}
      />
    </GestaoPage>
  );
}

function FeatureCard({
  icon,
  titulo,
  desc,
}: {
  icon: React.ReactNode;
  titulo: string;
  desc: string;
}) {
  return (
    <GestaoCard>
      <div className="mb-3">{icon}</div>
      <p className="font-medium">{titulo}</p>
      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
    </GestaoCard>
  );
}
