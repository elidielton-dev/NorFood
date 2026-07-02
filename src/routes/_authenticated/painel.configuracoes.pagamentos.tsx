import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import {
  ConfigSection,
  ConfigSwitchRow,
  ConfiguracoesPageFrame,
} from "@/components/configuracoes/configuracoes-page-frame";
import { getIntegrationStatus } from "@/lib/api/integrations.functions";
import {
  fetchTenantAdminSettingsServer,
  savePaymentMethodsServer,
} from "@/lib/api/tenant-settings-admin.functions";
import {
  PAYMENT_METHOD_DEFS,
  type PaymentMethodId,
} from "@/lib/payment-methods";
import { tenantPath } from "@/lib/tenant/painel-routes";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import { GestaoAlert, GestaoButton, StatusPill } from "@/components/gestao-ui";

const PAYMENT_DESCRIPTIONS: Record<PaymentMethodId, string> = {
  dinheiro: "Permite que o cliente pague em dinheiro no balcão ou na entrega.",
  pix_entrega: "Aceita Pix informado ou transferido na hora da entrega ou retirada.",
  pix_online: "Pix automático via Mercado Pago no checkout da loja online.",
  credito: "Cartão de crédito processado pelo Mercado Pago no checkout.",
  debito: "Cartão de débito processado pelo Mercado Pago no checkout.",
};

export const Route = createFileRoute("/_authenticated/painel/configuracoes/pagamentos")({
  component: ConfiguracoesPagamentosPage,
});

function ConfiguracoesPagamentosPage() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  const [methods, setMethods] = useState<PaymentMethodId[] | null>(null);

  const { data: integrations } = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => getIntegrationStatus(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["tenant-admin-settings", tenantSlug],
    queryFn: () => fetchTenantAdminSettingsServer({ data: tenantSlug! }),
  });

  useEffect(() => {
    if (data && !methods) setMethods(data.settings.payment_methods);
  }, [data, methods]);

  const saveMutation = useMutation({
    mutationFn: () =>
      savePaymentMethodsServer({ data: { tenantSlug: tenantSlug!, payment_methods: methods ?? [] } }),
    onSuccess: () => {
      toast.success("Meios de pagamento salvos.");
      void qc.invalidateQueries({ queryKey: ["tenant-admin-settings", tenantSlug] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mpAtivo = Boolean(integrations?.mercadoPago.enabled);
  const active = methods ?? data?.settings.payment_methods ?? [];

  function toggle(id: PaymentMethodId, on: boolean) {
    setMethods((current) => {
      const base = current ?? active;
      if (on) return base.includes(id) ? base : [...base, id];
      return base.filter((m) => m !== id);
    });
  }

  const presencial = PAYMENT_METHOD_DEFS.filter((m) => m.group === "presencial");
  const online = PAYMENT_METHOD_DEFS.filter((m) => m.group === "online");

  if (isLoading) {
    return (
      <ConfiguracoesPageFrame title="Meios de pagamento" description="Carregando...">
        <p className="text-sm text-muted-foreground">Carregando formas de pagamento...</p>
      </ConfiguracoesPageFrame>
    );
  }

  return (
    <ConfiguracoesPageFrame
      title="Meios de pagamento"
      description="Defina quais formas de pagamento serão aceitas no balcão, delivery e checkout online."
      actions={
        <GestaoButton onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="size-4" />
          Salvar
        </GestaoButton>
      }
    >
      <ConfigSection title="Presencial" description="Pagamentos no balcão e na entrega.">
        {presencial.map((meio) => (
          <ConfigSwitchRow
            key={meio.id}
            description={PAYMENT_DESCRIPTIONS[meio.id]}
            label={meio.label}
            checked={active.includes(meio.id)}
            onCheckedChange={(on) => toggle(meio.id, on)}
          />
        ))}
      </ConfigSection>

      <ConfigSection
        title="Online (Mercado Pago)"
        description="Pix e cartão no checkout da loja. Exige integração com Mercado Pago."
      >
        {online.map((meio) => {
          const blocked = meio.requiresMercadoPago && !mpAtivo;
          return (
            <div key={meio.id}>
              <ConfigSwitchRow
                description={PAYMENT_DESCRIPTIONS[meio.id]}
                label={meio.label}
                checked={active.includes(meio.id)}
                disabled={blocked}
                onCheckedChange={(on) => toggle(meio.id, on)}
              />
              {blocked ? (
                <div className="mb-3 flex justify-end pr-1">
                  <StatusPill tone="warning">Configure Mercado Pago</StatusPill>
                </div>
              ) : null}
            </div>
          );
        })}
        <div className="mt-2 flex flex-wrap gap-2 border-t border-[#F3F4F6] pt-4">
          <Link to={tenantPath(tenantSlug, "financeiro/mercado-pago")}>
            <GestaoButton variant="secondary" size="sm">
              Conta Mercado Pago
            </GestaoButton>
          </Link>
          <Link to={tenantPath(tenantSlug, "configuracoes/integracoes/mercado-pago")}>
            <GestaoButton variant="secondary" size="sm">
              Credenciais da integração
            </GestaoButton>
          </Link>
        </div>
      </ConfigSection>

      {!mpAtivo && active.some((id) => PAYMENT_METHOD_DEFS.find((m) => m.id === id)?.requiresMercadoPago) ? (
        <GestaoAlert tone="warning">
          Há meios online ativos, mas o Mercado Pago não está configurado. Clientes podem falhar no checkout.
        </GestaoAlert>
      ) : null}
    </ConfiguracoesPageFrame>
  );
}
