import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  ConfigSection,
  ConfigSettingRow,
  ConfiguracoesPageFrame,
} from "@/components/configuracoes/configuracoes-page-frame";
import { fetchMercadoPagoPanelServer } from "@/lib/api/mercado-pago-panel.functions";
import { formatBRL } from "@/lib/db";
import { tenantPath } from "@/lib/tenant/painel-routes";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import {
  GestaoAlert,
  GestaoButton,
  GestaoTable,
  GestaoTableHead,
  StatusPill,
} from "@/components/gestao-ui";

export const Route = createFileRoute("/_authenticated/painel/financeiro/mercado-pago")({
  component: MercadoPagoContaPage,
});

function MercadoPagoContaPage() {
  const tenantSlug = useTenantSlug();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["mp-panel"],
    queryFn: () => fetchMercadoPagoPanelServer(),
    refetchInterval: 120_000,
  });

  return (
    <ConfiguracoesPageFrame
      title="Conta Mercado Pago"
      description="Saldo, movimentações e status da integração de pagamentos."
      actions={
        <GestaoButton variant="secondary" onClick={() => refetch()}>
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </GestaoButton>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando painel Mercado Pago...</p>
      ) : null}

      {data && !data.configured ? (
        <GestaoAlert tone="warning">
          <p className="font-semibold">Integração não configurada</p>
          <p className="mt-1 text-sm text-muted-foreground">{data.message}</p>
          <Link
            to={tenantPath(tenantSlug, "configuracoes/integracoes/mercado-pago")}
            className="mt-3 inline-flex text-sm font-semibold text-[var(--tenant-primary,#FF7A00)] hover:underline"
          >
            Configurar credenciais
          </Link>
        </GestaoAlert>
      ) : null}

      {data?.configured ? (
        <>
          {data.message ? (
            <GestaoAlert tone="info">
              <p className="text-sm">{data.message}</p>
            </GestaoAlert>
          ) : null}

          <ConfigSection title="Resumo" description="Indicadores da conta conectada.">
            <ConfigSettingRow
              description="Valor disponível para saque na conta Mercado Pago."
              control={
                <span className="text-sm font-semibold text-[#111111]">
                  {data.availableBalance != null ? formatBRL(data.availableBalance) : "Consultar no MP"}
                </span>
              }
            />
            <ConfigSettingRow
              description="Total recebido nos últimos 30 dias."
              control={
                <span className="text-sm font-semibold text-[#111111]">
                  {formatBRL(data.totalReceived)}
                </span>
              }
            />
            <ConfigSettingRow
              description="Pagamentos aprovados no período consultado."
              control={<span className="text-sm font-semibold text-[#111111]">{data.approvedCount}</span>}
            />
            <ConfigSettingRow
              description="Pagamentos ainda pendentes de confirmação."
              control={<span className="text-sm font-semibold text-[#111111]">{data.pendingCount}</span>}
            />
          </ConfigSection>

          <ConfigSection
            title="Integração"
            description={`Ambiente ${data.environment} · Webhook ${data.webhookUrl ? "ativo" : "pendente"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={data.publicKeyConfigured ? "success" : "warning"}>
                Public key {data.publicKeyConfigured ? "ok" : "pendente"}
              </StatusPill>
              <StatusPill tone="neutral">Ambiente {data.environment}</StatusPill>
              <Link to={tenantPath(tenantSlug, "configuracoes/integracoes/mercado-pago")}>
                <GestaoButton variant="secondary" size="sm">
                  <ExternalLink className="size-3.5" />
                  Configurar credenciais
                </GestaoButton>
              </Link>
            </div>
          </ConfigSection>

          <ConfigSection title="Movimentações recentes" description="Últimos pagamentos recebidos via Mercado Pago.">
            <GestaoTable>
              <GestaoTableHead>
                <tr>
                  <th className="p-3">Data</th>
                  <th className="p-3">Referência</th>
                  <th className="hidden p-3 sm:table-cell">Status</th>
                  <th className="hidden p-3 md:table-cell">Tipo</th>
                  <th className="p-3 text-right">Valor</th>
                </tr>
              </GestaoTableHead>
              <tbody>
                {data.recentPayments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                      Nenhuma movimentação recente encontrada.
                    </td>
                  </tr>
                ) : (
                  data.recentPayments.map((payment) => (
                    <tr key={payment.id} className="border-t border-[#F3F4F6]">
                      <td className="p-3 text-muted-foreground">
                        {payment.createdAt
                          ? new Date(payment.createdAt).toLocaleString("pt-BR")
                          : "—"}
                      </td>
                      <td className="p-3">{payment.externalReference ?? payment.id}</td>
                      <td className="hidden p-3 capitalize sm:table-cell">{payment.status}</td>
                      <td className="hidden p-3 md:table-cell">{payment.paymentType ?? "—"}</td>
                      <td className="p-3 text-right font-semibold">{formatBRL(payment.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </GestaoTable>
          </ConfigSection>
        </>
      ) : null}
    </ConfiguracoesPageFrame>
  );
}
