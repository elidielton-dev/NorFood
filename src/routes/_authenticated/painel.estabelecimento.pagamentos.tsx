import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Banknote, CreditCard, Landmark, Smartphone } from "lucide-react";
import { getIntegrationStatus } from "@/lib/api/integrations.functions";
import {
  GestaoAlert,
  GestaoButton,
  GestaoCard,
  GestaoPage,
  GestaoSectionTitle,
  StatusPill,
} from "@/components/gestao-ui";

export const Route = createFileRoute("/_authenticated/painel/estabelecimento/pagamentos")({
  component: MeiosPagamentoPage,
});

const meiosPresenciais = [
  { id: "dinheiro", label: "Dinheiro na entrega", ativo: true, icon: Banknote },
  { id: "pix_entrega", label: "Pix na entrega", ativo: true, icon: Smartphone },
];

const meiosOnline = [
  { id: "pix_online", label: "Pix online (Mercado Pago)", icon: Smartphone },
  { id: "credito", label: "Cartao de credito (Mercado Pago)", icon: CreditCard },
  { id: "debito", label: "Cartao de debito (Mercado Pago)", icon: CreditCard },
];

function MeiosPagamentoPage() {
  const { data: integrations } = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => getIntegrationStatus(),
  });

  const mpAtivo = Boolean(integrations?.mercadoPago.enabled);

  return (
    <GestaoPage
      title="Meios de pagamento"
      subtitle="Formas aceitas na loja, delivery e checkout online"
    >
      <GestaoCard>
        <GestaoSectionTitle
          title="Na entrega e no balcao"
          description="Pagamentos presenciais aceitos pela operacao."
        />
        <ul className="mt-4 space-y-3">
          {meiosPresenciais.map((meio) => (
            <li
              key={meio.id}
              className="flex items-center justify-between rounded-xl border border-[color:var(--honey-line)] px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <meio.icon className="size-4 text-sage" />
                <span className="text-sm font-semibold">{meio.label}</span>
              </div>
              <StatusPill tone="success">Ativo</StatusPill>
            </li>
          ))}
        </ul>
      </GestaoCard>

      <GestaoCard>
        <GestaoSectionTitle
          title="Pagamentos online"
          description="Checkout Pix e cartao via Mercado Pago no delivery."
          action={<Landmark className="size-5 text-sage" />}
        />
        <ul className="mt-4 space-y-3">
          {meiosOnline.map((meio) => (
            <li
              key={meio.id}
              className="flex items-center justify-between rounded-xl border border-[color:var(--honey-line)] px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <meio.icon className="size-4 text-sage" />
                <span className="text-sm font-semibold">{meio.label}</span>
              </div>
              <StatusPill tone={mpAtivo ? "success" : "warning"}>
                {mpAtivo ? "Ativo" : "Configurar MP"}
              </StatusPill>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/painel/financeiro/mercado-pago">
            <GestaoButton variant="secondary">Conta Mercado Pago</GestaoButton>
          </Link>
          <Link to="/painel/configuracoes/integracoes/mercado-pago">
            <GestaoButton variant="secondary">Configurar integracao</GestaoButton>
          </Link>
        </div>
      </GestaoCard>

      {!mpAtivo ? (
        <GestaoAlert tone="warning">
          Para habilitar Pix e cartao online, configure as credenciais do Mercado Pago em
          Integracoes.
        </GestaoAlert>
      ) : null}
    </GestaoPage>
  );
}
