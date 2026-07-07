import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Mail, Phone } from "lucide-react";
import { ParceiroCard, ParceiroPage } from "@/routes/parceiro";
import { fetchResellerProfile } from "@/lib/reseller/client";
import { BILLING_PLANS } from "@/lib/platform/billing-plans";
import { cn } from "@/lib/shared/utils";

export const Route = createFileRoute("/parceiro/configuracoes")({
  component: ParceiroConfiguracoesPage,
});

function ParceiroConfiguracoesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reseller-profile"],
    queryFn: fetchResellerProfile,
  });

  const reseller = data?.reseller;
  const billing = data?.billing;

  return (
    <ParceiroPage
      title="Configurações"
      subtitle="Dados da revendedora, limites contratuais e preferências operacionais."
    >
      {isLoading ? (
        <p className="text-sm text-[#6B7280]">Carregando...</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ParceiroCard title="Identidade">
            <dl className="space-y-4 text-sm">
              <Row icon={Building2} label="Nome comercial" value={reseller?.name ?? "—"} />
              <Row label="Slug" value={reseller?.slug ?? "—"} mono />
              <Row icon={Mail} label="E-mail de contato" value={reseller?.contact_email ?? "—"} />
              <Row icon={Phone} label="Telefone" value={reseller?.contact_phone ?? "—"} />
              <Row label="Status" value={reseller?.status ?? "—"} capitalize />
              <Row label="CNPJ/Documento" value={reseller?.document_number ?? "—"} />
            </dl>
          </ParceiroCard>

          <ParceiroCard title="Contrato e limites">
            <dl className="space-y-4 text-sm">
              <Row label="Licenças máximas" value={String(reseller?.max_tenants ?? "—")} />
              <Row label="Trial padrão" value={`${reseller?.default_trial_days ?? 14} dias`} />
              <Row
                label="Planos permitidos"
                value={
                  reseller?.allowed_plans?.map((p) => BILLING_PLANS[p]?.name ?? p).join(", ") ?? "—"
                }
              />
              <Row
                label="Dia de ciclo"
                value={billing?.billing_cycle_day ? `Dia ${billing.billing_cycle_day}` : "—"}
              />
              <Row label="Pagamento NorFood" value={billing?.payment_status ?? "—"} capitalize />
            </dl>
            <p className="mt-4 text-xs text-[#9CA3AF]">
              Alterações contratuais são feitas pela equipe NorFood. Contate suporte@norfood.com.br.
            </p>
          </ParceiroCard>

          {reseller?.notes ? (
            <ParceiroCard title="Notas internas" className="lg:col-span-2">
              <p className="text-sm text-[#6B7280]">{reseller.notes}</p>
            </ParceiroCard>
          ) : null}
        </div>
      )}
    </ParceiroPage>
  );
}

function Row({
  label,
  value,
  icon: Icon,
  mono,
  capitalize,
}: {
  label: string;
  value: string;
  icon?: typeof Building2;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="flex gap-3">
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-[#FF9100]" /> : <div className="w-4" />}
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">{label}</dt>
        <dd className={cn("mt-0.5 text-[#111111]", mono && "font-mono text-xs", capitalize && "capitalize")}>
          {value}
        </dd>
      </div>
    </div>
  );
}
