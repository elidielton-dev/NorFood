/** @deprecated Use AdminPage from @/routes/admin */
export { AdminPage, AdminCard, AdminStatCard } from "@/components/admin/admin-layout-shell";

import { LayoutDashboard } from "lucide-react";
import type { ReactNode } from "react";

/** @deprecated Use AdminPage inside AdminLayoutShell */
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
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#FF9100]">Plataforma</p>
          <h1 className="text-2xl font-semibold text-[#111111] sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-[#6B7280]">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function AdminPanelLink({ href, label }: { href: string; label: string }) {
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
