import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPage } from "@/routes/admin";
import { createResellerAdmin, suggestResellerSlug } from "@/lib/reseller/client";
import type { BillingPlanId } from "@/lib/platform/billing-plans";

export const Route = createFileRoute("/admin/revendedoras/nova")({
  component: AdminNovaRevendedoraPage,
});

function AdminNovaRevendedoraPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    contact_email: "",
    contact_phone: "",
    document_number: "",
    max_tenants: 10,
    price_per_tenant: 79.9,
    owner_email: "",
    owner_name: "",
    owner_password: "",
    allowed_plans: ["starter", "pro"] as BillingPlanId[],
  });

  const createMutation = useMutation({
    mutationFn: () => createResellerAdmin(form),
    onSuccess: (reseller) => {
      toast.success("Revendedora criada.");
      void navigate({ to: "/admin/revendedoras/$resellerId", params: { resellerId: reseller.id } });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function suggestSlug() {
    if (!form.name.trim()) return;
    const slug = await suggestResellerSlug(form.name);
    setForm((f) => ({ ...f, slug }));
  }

  return (
    <AdminPage title="Nova revendedora" subtitle="Cadastro de hiperador.">
      <form
        className="max-w-2xl space-y-4 rounded-2xl border border-[#E5E7EB] bg-white p-6"
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
      >
        <Field label="Nome fantasia">
          <input
            className="w-full rounded-lg border px-3 py-2"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            onBlur={() => void suggestSlug()}
            required
          />
        </Field>
        <Field label="Slug">
          <input
            className="w-full rounded-lg border px-3 py-2"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
            required
          />
        </Field>
        <Field label="E-mail comercial">
          <input
            type="email"
            className="w-full rounded-lg border px-3 py-2"
            value={form.contact_email}
            onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
            required
          />
        </Field>
        <Field label="CNPJ (opcional)">
          <input
            className="w-full rounded-lg border px-3 py-2"
            value={form.document_number}
            onChange={(e) => setForm((f) => ({ ...f, document_number: e.target.value }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max. restaurantes">
            <input
              type="number"
              min={1}
              className="w-full rounded-lg border px-3 py-2"
              value={form.max_tenants}
              onChange={(e) => setForm((f) => ({ ...f, max_tenants: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Preco por tenant (R$)">
            <input
              type="number"
              step="0.01"
              className="w-full rounded-lg border px-3 py-2"
              value={form.price_per_tenant}
              onChange={(e) => setForm((f) => ({ ...f, price_per_tenant: Number(e.target.value) }))}
            />
          </Field>
        </div>
        <hr className="border-[#E5E7EB]" />
        <p className="text-sm font-semibold text-[#111111]">Usuario owner do painel parceiro</p>
        <Field label="E-mail owner">
          <input
            type="email"
            className="w-full rounded-lg border px-3 py-2"
            value={form.owner_email}
            onChange={(e) => setForm((f) => ({ ...f, owner_email: e.target.value }))}
            required
          />
        </Field>
        <Field label="Nome owner">
          <input
            className="w-full rounded-lg border px-3 py-2"
            value={form.owner_name}
            onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value }))}
            required
          />
        </Field>
        <Field label="Senha inicial">
          <input
            type="password"
            className="w-full rounded-lg border px-3 py-2"
            value={form.owner_password}
            onChange={(e) => setForm((f) => ({ ...f, owner_password: e.target.value }))}
            required
            minLength={6}
          />
        </Field>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-xl bg-[#111111] px-4 py-2.5 text-sm font-medium text-white"
          >
            Criar revendedora
          </button>
          <Link to="/admin/revendedoras" className="rounded-xl border px-4 py-2.5 text-sm">
            Cancelar
          </Link>
        </div>
      </form>
    </AdminPage>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
