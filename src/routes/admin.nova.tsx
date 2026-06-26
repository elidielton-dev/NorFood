import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { createAdminTenant } from "@/lib/platform-admin/client";
import { slugifyTenantName } from "@/lib/platform-admin/slug";
import { suggestTenantSlugServer } from "@/lib/api/platform-admin.functions";
import { isBrowserDemoEnabled } from "@/lib/runtime";
import type { TenantStatus } from "@/lib/tenant/types";

export const Route = createFileRoute("/admin/nova")({
  component: AdminNovaEmpresaPage,
});

function AdminNovaEmpresaPage() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#FF9100");
  const [status, setStatus] = useState<TenantStatus>("trial");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");

  useEffect(() => {
    if (!name.trim()) return;
    const timer = window.setTimeout(async () => {
      if (isBrowserDemoEnabled()) {
        setSlug(slugifyTenantName(name) || "empresa");
        return;
      }
      try {
        const suggested = await suggestTenantSlugServer({ data: name });
        setSlug(suggested);
      } catch {
        setSlug(slugifyTenantName(name));
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [name]);

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminTenant({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        subtitle: subtitle.trim() || undefined,
        primary_color: primaryColor,
        status,
        owner_name: ownerName.trim() || undefined,
        owner_email: ownerEmail.trim() || undefined,
        owner_password: ownerPassword.trim() || undefined,
      }),
    onSuccess: (tenant) => {
      toast.success(`Empresa "${tenant.name}" criada com sucesso!`);
      nav({ to: "/admin/$tenantId", params: { tenantId: tenant.id } });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <AdminShell
      title="Nova empresa"
      subtitle="Cadastre um restaurante na plataforma e vincule o dono."
    >
      <form
        className="mx-auto max-w-2xl space-y-6 rounded-xl border border-[#E5E7EB] bg-white p-6"
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
      >
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[#111111]">Dados da empresa</h2>
          <Field label="Nome *" required>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pizzaria do João"
              className={inputClass}
            />
          </Field>
          <Field label="Slug (URL) *" hint="Usado em /t/slug e /loja/slug">
            <input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="pizzaria-joao"
              className={inputClass}
            />
          </Field>
          <Field label="Subtítulo">
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Delivery e retirada"
              className={inputClass}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cor principal">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="size-10 cursor-pointer rounded-lg border border-[#E5E7EB]"
                />
                <input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className={inputClass}
                />
              </div>
            </Field>
            <Field label="Status inicial">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TenantStatus)}
                className={inputClass}
              >
                <option value="trial">Trial</option>
                <option value="active">Ativa</option>
                <option value="suspended">Suspensa</option>
              </select>
            </Field>
          </div>
        </section>

        <section className="space-y-4 border-t border-[#E5E7EB] pt-6">
          <h2 className="text-sm font-semibold text-[#111111]">Dono da empresa (opcional)</h2>
          <p className="text-xs text-[#6B7280]">
            {isBrowserDemoEnabled()
              ? "No modo demo, o e-mail fica registrado localmente. Com Supabase, cria o usuário e vincula como owner."
              : "Cria o usuário no Supabase Auth e vincula como owner no painel."}
          </p>
          <Field label="Nome do dono">
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="João Silva"
              className={inputClass}
            />
          </Field>
          <Field label="E-mail do dono">
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="joao@restaurante.com"
              className={inputClass}
            />
          </Field>
          {!isBrowserDemoEnabled() ? (
            <Field label="Senha inicial" hint="Padrão: Norfood123! se deixar em branco">
              <input
                type="password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </Field>
          ) : null}
        </section>

        <div className="flex flex-col gap-3 border-t border-[#E5E7EB] pt-6 sm:flex-row sm:justify-end">
          <Link
            to="/admin"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[#E5E7EB] px-4 text-sm font-semibold text-[#111111] hover:bg-[#F6F7F9]"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#FF7A00] px-5 text-sm font-semibold text-white hover:bg-[#e66e00] disabled:opacity-60"
          >
            {createMutation.isPending ? "Criando..." : "Criar empresa"}
          </button>
        </div>
      </form>
    </AdminShell>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm outline-none focus:border-[#FF7A00] focus:ring-2 focus:ring-[#FF7A00]/15";

function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[#6B7280]">
        {label}
        {required ? <span className="text-[#FF7A00]"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[#9CA3AF]">{hint}</span> : null}
    </label>
  );
}
