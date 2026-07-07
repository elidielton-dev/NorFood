import { createFileRoute } from "@tanstack/react-router";
import { AdminCard, AdminPage } from "@/routes/admin";
import { parsePlatformAdminEmails } from "@/lib/platform-admin/emails";
import { getPlatformCapacityConfig } from "@/lib/platform/platform-limits";
import { isBrowserDemoEnabled, isProductionMode } from "@/lib/shared/runtime";

export const Route = createFileRoute("/admin/configuracoes")({
  component: AdminConfiguracoesPage,
});

function AdminConfiguracoesPage() {
  const adminEmails = parsePlatformAdminEmails(import.meta.env.VITE_PLATFORM_ADMIN_EMAILS);
  const capacity = getPlatformCapacityConfig();

  return (
    <AdminPage title="Configurações" subtitle="Parâmetros globais da plataforma NorFood.">
      <div className="grid gap-6 lg:grid-cols-2">
        <AdminCard title="Administradores da plataforma">
          <p className="mb-3 text-sm text-[#6B7280]">E-mails com acesso ao /admin (variável VITE_PLATFORM_ADMIN_EMAILS):</p>
          {adminEmails.length === 0 ? (
            <p className="text-sm text-amber-700">Nenhum e-mail configurado — verifique .env</p>
          ) : (
            <ul className="space-y-1">
              {adminEmails.map((email) => (
                <li key={email} className="rounded-lg bg-[#F6F7F9] px-3 py-2 text-sm font-mono">{email}</li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard title="Ambiente">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-[#6B7280]">Modo produção</dt><dd className="font-medium">{isProductionMode() ? "Sim" : "Não"}</dd></div>
            <div className="flex justify-between"><dt className="text-[#6B7280]">Demo browser</dt><dd className="font-medium">{isBrowserDemoEnabled() ? "Ativo" : "Inativo"}</dd></div>
            <div className="flex justify-between"><dt className="text-[#6B7280]">Perfil VPS</dt><dd className="font-medium">{capacity.label}</dd></div>
            <div className="flex justify-between"><dt className="text-[#6B7280]">Max tenants</dt><dd className="font-medium">{capacity.maxTenants}</dd></div>
          </dl>
        </AdminCard>

        <AdminCard title="Domínio e URLs" className="lg:col-span-2">
          <p className="text-sm text-[#6B7280]">
            URL pública: <strong className="text-[#111111]">{import.meta.env.VITE_PUBLIC_APP_URL ?? import.meta.env.PUBLIC_APP_URL ?? "—"}</strong>
          </p>
          <p className="mt-2 text-xs text-[#9CA3AF]">
            Alterações de infraestrutura (VPS, DNS, SSL) são feitas no servidor e Registro.br.
          </p>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
