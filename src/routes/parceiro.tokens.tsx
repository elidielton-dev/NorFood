import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ParceiroDataTable, type ParceiroTableColumn } from "@/components/parceiro/parceiro-data-table";
import { ParceiroCard, ParceiroPage } from "@/routes/parceiro";
import {
  createActivationToken,
  fetchActivationTokens,
  fetchResellerDashboard,
  revokeActivationToken,
} from "@/lib/reseller/client";
import type { ActivationTokenRow } from "@/lib/reseller/types";
import type { BillingPlanId } from "@/lib/platform/billing-plans";
import { BILLING_PLANS } from "@/lib/platform/billing-plans";

export const Route = createFileRoute("/parceiro/tokens")({
  component: ParceiroTokensPage,
});

function ParceiroTokensPage() {
  const qc = useQueryClient();
  const { data: dashboard } = useQuery({
    queryKey: ["reseller-dashboard"],
    queryFn: fetchResellerDashboard,
  });
  const allowedPlans = dashboard?.reseller.allowed_plans ?? ["starter", "pro"];

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["reseller-tokens"],
    queryFn: fetchActivationTokens,
  });

  const [plan, setPlan] = useState<BillingPlanId>(allowedPlans[0] ?? "starter");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(30);

  const createMutation = useMutation({
    mutationFn: () =>
      createActivationToken({
        plan,
        maxUses,
        expiresInDays,
        trialDays: dashboard?.reseller.default_trial_days,
      }),
    onSuccess: (result) => {
      const url = `${window.location.origin}${result.link}`;
      void navigator.clipboard.writeText(url);
      toast.success("Link copiado para a area de transferencia.");
      void qc.invalidateQueries({ queryKey: ["reseller-tokens"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeActivationToken,
    onSuccess: () => {
      toast.success("Token revogado.");
      void qc.invalidateQueries({ queryKey: ["reseller-tokens"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const columns: ParceiroTableColumn<ActivationTokenRow>[] = [
    {
      id: "token",
      header: "Token",
      sortable: true,
      sortValue: (t) => t.token_prefix,
      cell: (t) => <span className="font-mono text-xs">{t.token_prefix}…</span>,
    },
    {
      id: "plan",
      header: "Plano",
      sortable: true,
      sortValue: (t) => t.plan,
      cell: (t) => BILLING_PLANS[t.plan]?.name ?? t.plan,
    },
    {
      id: "uses",
      header: "Usos",
      sortable: true,
      sortValue: (t) => t.uses_count,
      cell: (t) => `${t.uses_count}/${t.max_uses}`,
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      sortValue: (t) => t.status,
      cell: (t) => <span className="capitalize">{t.status}</span>,
    },
    {
      id: "expires",
      header: "Expira",
      sortable: true,
      sortValue: (t) => t.expires_at ?? "",
      cell: (t) =>
        t.expires_at ? new Date(t.expires_at).toLocaleDateString("pt-BR") : "—",
    },
    {
      id: "action",
      header: "",
      className: "text-right",
      cell: (t) =>
        t.status === "active" ? (
          <button
            type="button"
            onClick={() => revokeMutation.mutate(t.id)}
            className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline"
          >
            <Trash2 className="size-3.5" />
            Revogar
          </button>
        ) : (
          <span className="text-xs text-[#9CA3AF]">—</span>
        ),
    },
  ];

  return (
    <ParceiroPage title="Tokens de ativacao" subtitle="Links para novos restaurantes se cadastrarem.">
      <ParceiroCard title="Gerar novo link" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Plano</span>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={plan}
              onChange={(e) => setPlan(e.target.value as BillingPlanId)}
            >
              {allowedPlans.map((p) => (
                <option key={p} value={p}>
                  {BILLING_PLANS[p].name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Usos</span>
            <input
              type="number"
              min={1}
              className="w-full rounded-lg border px-3 py-2"
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Validade (dias)</span>
            <input
              type="number"
              min={1}
              className="w-full rounded-lg border px-3 py-2"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="w-full rounded-lg bg-[#111111] px-4 py-2.5 text-sm font-medium text-white"
            >
              Gerar link
            </button>
          </div>
        </div>
      </ParceiroCard>

      <ParceiroDataTable
        columns={columns}
        data={tokens}
        rowKey={(t) => t.id}
        isLoading={isLoading}
        searchPlaceholder="Pesquisa rapida..."
        searchMatch={(t, q) => `${t.token_prefix} ${t.plan} ${t.status}`.toLowerCase().includes(q)}
        filters={[
          {
            id: "status",
            label: "Status",
            options: [
              { value: "active", label: "Ativo" },
              { value: "consumed", label: "Consumido" },
              { value: "expired", label: "Expirado" },
              { value: "revoked", label: "Revogado" },
            ],
            match: (t, v) => t.status === v,
          },
        ]}
        emptyMessage="Nenhum token gerado."
      />
    </ParceiroPage>
  );
}
