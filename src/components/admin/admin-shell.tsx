import { Link } from "@tanstack/react-router";
import { Building2, LayoutDashboard, Plus, Users } from "lucide-react";
import type { ReactNode } from "react";
import { NorfoodLogo } from "@/components/brand/norfood-logo";

export function AdminShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <header className="sticky top-0 z-50 border-b border-[#E5E7EB] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="flex items-center gap-2">
              <NorfoodLogo size="sm" />
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-[#1A1A1A]">NorFood Admin</p>
                <p className="text-xs text-[#6B7280]">Gestão da plataforma</p>
              </div>
            </Link>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[#6B7280] hover:bg-[#F6F7F9] hover:text-[#111111]"
            >
              <Building2 className="size-3.5" />
              Empresas
            </Link>
            <Link
              to="/admin/revendedoras"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[#6B7280] hover:bg-[#F6F7F9] hover:text-[#111111]"
            >
              <Users className="size-3.5" />
              Revendedoras
            </Link>
            <Link
              to="/admin/faturamento"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[#6B7280] hover:bg-[#F6F7F9] hover:text-[#111111]"
            >
              Faturamento
            </Link>
            <Link
              to="/admin/nova"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#111111] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#333]"
            >
              <Plus className="size-3.5" />
              Nova empresa
            </Link>
            <Link
              to="/"
              className="hidden rounded-lg px-3 py-1.5 text-xs font-medium text-[#6B7280] hover:bg-[#F6F7F9] sm:inline-flex"
            >
              Site
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#FF9100]">
              Plataforma
            </p>
            <h1 className="text-2xl font-semibold text-[#111111] sm:text-3xl">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-[#6B7280]">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}

export function AdminStatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-semibold text-[#111111]">{value}</p>
    </div>
  );
}

export function AdminPanelLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] px-2.5 py-1 text-xs font-medium text-[#111111] hover:bg-[#F6F7F9]"
    >
      <LayoutDashboard className="size-3" />
      {label}
    </a>
  );
}
