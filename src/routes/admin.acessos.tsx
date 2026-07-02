import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { AdminCard, AdminPage } from "@/routes/admin";
import { parsePlatformAdminEmails } from "@/lib/platform-admin/emails";

export const Route = createFileRoute("/admin/acessos")({
  component: AdminAcessosPage,
});

function AdminAcessosPage() {
  const adminEmails = parsePlatformAdminEmails(import.meta.env.VITE_PLATFORM_ADMIN_EMAILS);

  return (
    <AdminPage title="Acessos admin" subtitle="Controle de quem pode operar a plataforma NorFood.">
      <AdminCard title="Platform admins autorizados">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[#111111] text-white">
            <Shield className="size-5" />
          </div>
          <div>
            <p className="font-semibold">{adminEmails.length} administrador(es)</p>
            <p className="text-sm text-[#6B7280]">Autenticação via Supabase + lista de e-mails</p>
          </div>
        </div>
        <ul className="divide-y divide-[#F3F4F6] rounded-xl border border-[#E5E7EB]">
          {adminEmails.map((email) => (
            <li key={email} className="px-4 py-3 text-sm font-medium">{email}</li>
          ))}
        </ul>
      </AdminCard>

      <AdminCard title="Impersonate" className="mt-6">
        <p className="text-sm text-[#6B7280]">
          Admins podem acessar painéis de restaurantes via links em{" "}
          <Link to="/admin/empresas" className="font-medium text-[#FF9100] hover:underline">Empresas</Link>
          . Revendedoras usam impersonate dedicado em{" "}
          <Link to="/admin/revendedoras" className="font-medium text-[#FF9100] hover:underline">Revendedoras</Link>.
        </p>
      </AdminCard>
    </AdminPage>
  );
}
