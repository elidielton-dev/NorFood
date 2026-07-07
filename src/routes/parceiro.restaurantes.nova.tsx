import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ParceiroPage } from "@/routes/parceiro";
import {
  createResellerTenant,
  fetchResellerDashboard,
} from "@/lib/reseller/client";
import { suggestRestaurantSlugServer } from "@/lib/api/financeiro/platform-billing.functions";
import type { BillingPlanId } from "@/lib/platform/billing-plans";
import { BILLING_PLANS } from "@/lib/platform/billing-plans";

export const Route = createFileRoute("/parceiro/restaurantes/nova")({
  component: ParceiroNovaRestaurantePage,
});

function ParceiroNovaRestaurantePage() {
  const navigate = useNavigate();
  const { data: dashboard } = useQuery({
    queryKey: ["reseller-dashboard"],
    queryFn: fetchResellerDashboard,
  });
  const allowedPlans = dashboard?.reseller.allowed_plans ?? ["starter", "pro"];

  const [form, setForm] = useState({
    restaurantName: "",
    slug: "",
    plan: allowedPlans[0] as BillingPlanId,
    ownerEmail: "",
    ownerName: "",
    ownerPassword: "",
    ownerPhone: "",
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createResellerTenant({
        restaurantName: form.restaurantName,
        slug: form.slug,
        plan: form.plan,
        billingModel: "monthly",
        ownerEmail: form.ownerEmail,
        ownerName: form.ownerName,
        ownerPassword: form.ownerPassword,
        ownerPhone: form.ownerPhone || undefined,
      }),
    onSuccess: () => {
      toast.success("Restaurante criado com sucesso.");
      void navigate({ to: "/parceiro/restaurantes" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function suggestSlug() {
    if (!form.restaurantName.trim()) return;
    try {
      const slug = await suggestRestaurantSlugServer({ data: form.restaurantName });
      setForm((f) => ({ ...f, slug }));
    } catch {
      // ignore
    }
  }

  return (
    <ParceiroPage title="Novo restaurante" subtitle="Cadastro manual na carteira.">
      <form
        className="max-w-xl space-y-4 rounded-2xl border border-[#E5E7EB] bg-white p-6"
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
      >
        <Field label="Nome do restaurante">
          <input
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2"
            value={form.restaurantName}
            onChange={(e) => setForm((f) => ({ ...f, restaurantName: e.target.value }))}
            onBlur={() => void suggestSlug()}
            required
          />
        </Field>
        <Field label="Slug (URL)">
          <input
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
            required
          />
        </Field>
        <Field label="Plano">
          <select
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2"
            value={form.plan}
            onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value as BillingPlanId }))}
          >
            {allowedPlans.map((plan) => (
              <option key={plan} value={plan}>
                {BILLING_PLANS[plan].name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="E-mail do proprietario">
          <input
            type="email"
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2"
            value={form.ownerEmail}
            onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
            required
          />
        </Field>
        <Field label="Nome do proprietario">
          <input
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2"
            value={form.ownerName}
            onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
            required
          />
        </Field>
        <Field label="Senha inicial">
          <input
            type="password"
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2"
            value={form.ownerPassword}
            onChange={(e) => setForm((f) => ({ ...f, ownerPassword: e.target.value }))}
            required
            minLength={6}
          />
        </Field>
        <Field label="Telefone (opcional)">
          <input
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2"
            value={form.ownerPhone}
            onChange={(e) => setForm((f) => ({ ...f, ownerPhone: e.target.value }))}
          />
        </Field>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-xl bg-[#111111] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Criar restaurante
          </button>
          <Link to="/parceiro/restaurantes" className="rounded-xl border px-4 py-2.5 text-sm">
            Cancelar
          </Link>
        </div>
      </form>
    </ParceiroPage>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-[#111111]">{label}</span>
      {children}
    </label>
  );
}
