import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Landmark } from "lucide-react";
import { fetchMercadoPagoPanelServer } from "@/lib/api/mercado-pago-panel.functions";
import { formatBRL } from "@/lib/db";
import {
  GestaoAlert,
  GestaoButton,
  GestaoCard,
  GestaoPage,
  GestaoSectionTitle,
  GestaoStat,
} from "@/components/gestao-ui";

export const Route = createFileRoute("/_authenticated/painel/financeiro/saques")({
  component: FinanceiroSaquesPage,
});

function FinanceiroSaquesPage() {
  const { data } = useQuery({
    queryKey: ["mp-panel"],
    queryFn: () => fetchMercadoPagoPanelServer(),
  });

  return (
    <GestaoPage
      title="Saques"
      subtitle="Repasses e disponibilidade para transferencia bancaria"
      actions={
        <a href="https://www.mercadopago.com.br/balance/reports" target="_blank" rel="noreferrer">
          <GestaoButton variant="secondary">
            <ExternalLink className="size-4" /> Abrir Mercado Pago
          </GestaoButton>
        </a>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <GestaoStat
          label="Saldo disponivel"
          value={data?.availableBalance != null ? formatBRL(data.availableBalance) : "—"}
          icon={<Landmark className="size-5" />}
          tone="gold"
        />
        <GestaoStat
          label="Recebido no periodo"
          value={formatBRL(data?.totalReceived ?? 0)}
          icon={<Landmark className="size-5" />}
          tone="success"
        />
      </div>

      <GestaoCard>
        <GestaoSectionTitle
          title="Como sacar"
          description="Os repasses do Mercado Pago seguem o cronograma da sua conta credenciada."
        />
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Confirme que a integracao esta em producao e com webhook ativo.</li>
          <li>Acompanhe pagamentos aprovados na conta bancaria do painel.</li>
          <li>Realize saques e transferencias diretamente no painel oficial do Mercado Pago.</li>
        </ol>
        <Link to="/painel/financeiro/mercado-pago" className="mt-4 inline-block">
          <GestaoButton>Ver conta bancaria</GestaoButton>
        </Link>
      </GestaoCard>

      {!data?.configured ? (
        <GestaoAlert tone="warning">
          Configure o Mercado Pago em Integracoes para habilitar saques e repasses.
        </GestaoAlert>
      ) : null}
    </GestaoPage>
  );
}
