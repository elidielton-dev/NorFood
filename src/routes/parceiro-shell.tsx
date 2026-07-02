import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function ParceiroShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <header className="sticky top-0 z-50 border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#FF9100]">Hiperador</p>
            <p className="text-sm font-semibold text-[#111111]">NorFood Parceiros</p>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <Link to="/parceiro" className="rounded-lg px-3 py-1.5 text-[#6B7280] hover:bg-[#F6F7F9]">
              Dashboard
            </Link>
            <Link
              to="/parceiro/restaurantes"
              className="rounded-lg px-3 py-1.5 text-[#6B7280] hover:bg-[#F6F7F9]"
            >
              Restaurantes
            </Link>
            <Link
              to="/parceiro/tokens"
              className="rounded-lg px-3 py-1.5 text-[#6B7280] hover:bg-[#F6F7F9]"
            >
              Tokens
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#111111]">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-[#6B7280]">{subtitle}</p> : null}
        </div>
        {children}
      </main>
    </div>
  );
}
