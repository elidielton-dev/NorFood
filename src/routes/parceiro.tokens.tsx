import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ParceiroShell } from "@/routes/parceiro";
import {
  createActivationToken,
  fetchActivationTokens,
  fetchResellerDashboard,
  revokeActivationToken,
} from "@/lib/reseller/client";
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

  return (
    <ParceiroShell title="Tokens de ativacao" subtitle="Links para novos restaurantes se cadastrarem.">
      <div className="mb-6 grid gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 sm:grid-cols-4">
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
            className="w-full rounded-xl bg-[#111111] px-4 py-2.5 text-sm font-medium text-white"
          >
            Gerar link
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-[#6B7280]">Carregando...</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#F6F7F9] text-left text-xs uppercase text-[#6B7280]">
              <tr>
                <th className="px-4 py-3">Token</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Usos</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expira</th>
                <th className="px-4 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <tr key={token.id} className="border-t border-[#E5E7EB]">
                  <td className="px-4 py-3 font-mono text-xs">{token.token_prefix}…</td>
                  <td className="px-4 py-3 capitalize">{token.plan}</td>
                  <td className="px-4 py-3">
                    {token.uses_count}/{token.max_uses}
                  </td>
                  <td className="px-4 py-3 capitalize">{token.status}</td>
                  <td className="px-4 py-3">
                    {token.expires_at
                      ? new Date(token.expires_at).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {token.status === "active" ? (
                      <button
                        type="button"
                        onClick={() => revokeMutation.mutate(token.id)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="size-3.5" />
                        Revogar
                      </button>
                    ) : (
                      <span className="text-xs text-[#6B7280]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ParceiroShell>
  );
}
