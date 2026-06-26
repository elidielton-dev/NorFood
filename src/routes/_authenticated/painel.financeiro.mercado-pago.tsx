import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Landmark, RefreshCw } from "lucide-react";
import { fetchMercadoPagoPanelServer } from "@/lib/api/mercado-pago-panel.functions";
import { formatBRL } from "@/lib/db";
import {
  GestaoAlert,
  GestaoButton,
  GestaoCard,
  GestaoPage,
  GestaoSectionTitle,
  GestaoStat,
  GestaoTable,
  GestaoTableHead,
  StatusPill,
} from "@/components/gestao-ui";

export const Route = createFileRoute("/_authenticated/painel/financeiro/mercado-pago")({
  component: MercadoPagoContaPage,
});

function MercadoPagoContaPage() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["mp-panel"],
    queryFn: () => fetchMercadoPagoPanelServer(),
    refetchInterval: 120_000,
  });

  return (
    <GestaoPage
      title="Conta bancaria"
      subtitle="Painel Mercado Pago — saldo, movimentacoes e status da integracao"
      actions={
        <GestaoButton variant="secondary" onClick={() => refetch()}>
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </GestaoButton>
      }
    >
      {isLoading ? (
        <GestaoCard>
          <p className="text-sm text-muted-foreground">Carregando painel Mercado Pago...</p>
        </GestaoCard>
      ) : null}

      {data && !data.configured ? (
        <GestaoAlert tone="warning">
          <p className="font-semibold">Integracao nao configurada</p>
          <p className="mt-1 text-sm text-muted-foreground">{data.message}</p>
          <Link
            to="/painel/configuracoes/integracoes/mercado-pago"
            className="mt-3 inline-flex text-sm font-semibold text-sage hover:underline"
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

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <GestaoStat
              label="Saldo disponivel"
              value={
                data.availableBalance != null ? formatBRL(data.availableBalance) : "Consultar no MP"
              }
              icon={<Landmark className="size-5" />}
              tone="gold"
            />
            <GestaoStat
              label="Recebido (30 dias)"
              value={formatBRL(data.totalReceived)}
              icon={<Landmark className="size-5" />}
              tone="success"
            />
            <GestaoStat
              label="Aprovados"
              value={String(data.approvedCount)}
              icon={<Landmark className="size-5" />}
            />
            <GestaoStat
              label="Pendentes"
              value={String(data.pendingCount)}
              icon={<Landmark className="size-5" />}
              tone="warning"
            />
          </div>

          <GestaoCard>
            <GestaoSectionTitle
              title="Integracao"
              description={`Ambiente ${data.environment} · Webhook ${data.webhookUrl ? "ativo" : "pendente"}`}
              action={
                <Link to="/painel/configuracoes/integracoes/mercado-pago">
                  <GestaoButton variant="secondary" className="text-xs">
                    <ExternalLink className="size-3.5" /> Configurar
                  </GestaoButton>
                </Link>
              }
            />
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <StatusPill tone={data.publicKeyConfigured ? "success" : "warning"}>
                Public key {data.publicKeyConfigured ? "ok" : "pendente"}
              </StatusPill>
              <StatusPill tone="neutral">Ambiente {data.environment}</StatusPill>
            </div>
          </GestaoCard>

          <GestaoTable>
            <GestaoTableHead>
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Referencia</th>
                <th className="hidden p-3 sm:table-cell">Status</th>
                <th className="hidden p-3 md:table-cell">Tipo</th>
                <th className="p-3 text-right">Valor</th>
              </tr>
            </GestaoTableHead>
            <tbody>
              {data.recentPayments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                    Nenhuma movimentacao recente encontrada.
                  </td>
                </tr>
              ) : (
                data.recentPayments.map((payment) => (
                  <tr key={payment.id} className="border-t border-[color:var(--honey-line)]">
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
        </>
      ) : null}
    </GestaoPage>
  );
}
