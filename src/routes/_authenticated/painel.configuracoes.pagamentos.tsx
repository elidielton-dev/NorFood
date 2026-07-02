import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { ConfigPageBack } from "@/components/config-hub-ui";
import { getIntegrationStatus } from "@/lib/api/integrations.functions";
import {
  fetchTenantAdminSettingsServer,
  savePaymentMethodsServer,
} from "@/lib/api/tenant-settings-admin.functions";
import {
  PAYMENT_METHOD_DEFS,
  type PaymentMethodId,
} from "@/lib/payment-methods";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import {
  GestaoAlert,
  GestaoButton,
  GestaoCard,
  GestaoPage,
  GestaoSectionTitle,
  StatusPill,
} from "@/components/gestao-ui";

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

  return (
    <GestaoPage
      title="Meios de pagamento"
      subtitle="Formas aceitas no balcão, delivery e checkout online."
      actions={<ConfigPageBack />}
    >
      {isLoading ? (
        <GestaoCard>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </GestaoCard>
      ) : (
        <>
          <GestaoCard>
            <GestaoSectionTitle title="Presencial" description="Na entrega e no balcão." />
            <ul className="mt-4 space-y-3">
              {presencial.map((meio) => (
                <li
                  key={meio.id}
                  className="flex items-center justify-between rounded-xl border border-[color:var(--honey-line)] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <meio.icon className="size-4 text-sage" />
                    <span className="text-sm font-semibold">{meio.label}</span>
                  </div>
                  <Switch checked={active.includes(meio.id)} onCheckedChange={(on) => toggle(meio.id, on)} />
                </li>
              ))}
            </ul>
          </GestaoCard>

          <GestaoCard>
            <GestaoSectionTitle
              title="Online (Mercado Pago)"
              description="Pix e cartão no checkout da loja."
            />
            <ul className="mt-4 space-y-3">
              {online.map((meio) => {
                const blocked = meio.requiresMercadoPago && !mpAtivo;
                return (
                  <li
                    key={meio.id}
                    className="flex items-center justify-between rounded-xl border border-[color:var(--honey-line)] px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <meio.icon className="size-4 text-sage" />
                      <span className="text-sm font-semibold">{meio.label}</span>
                      {blocked ? <StatusPill tone="warning">Configure MP</StatusPill> : null}
                    </div>
                    <Switch
                      checked={active.includes(meio.id)}
                      disabled={blocked}
                      onCheckedChange={(on) => toggle(meio.id, on)}
                    />
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/painel/financeiro/mercado-pago">
                <GestaoButton variant="secondary">Conta Mercado Pago</GestaoButton>
              </Link>
              <Link to="/painel/configuracoes/integracoes/mercado-pago">
                <GestaoButton variant="secondary">Credenciais da integração</GestaoButton>
              </Link>
            </div>
          </GestaoCard>

          {!mpAtivo && active.some((id) => PAYMENT_METHOD_DEFS.find((m) => m.id === id)?.requiresMercadoPago) ? (
            <GestaoAlert tone="warning">
              Há meios online ativos, mas o Mercado Pago não está configurado. Clientes podem falhar no checkout.
            </GestaoAlert>
          ) : null}

          <GestaoButton onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="size-4" />
            Salvar meios de pagamento
          </GestaoButton>
        </>
      )}
    </GestaoPage>
  );
}
