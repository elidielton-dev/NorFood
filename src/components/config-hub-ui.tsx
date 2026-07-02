import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { GestaoButton } from "@/components/gestao-ui";
import { useTenantOptional } from "@/lib/tenant/tenant-context";
import { mapLegacyPainelPath } from "@/lib/tenant/painel-routes";

import { useConfiguracoesEmbedded } from "@/components/configuracoes/configuracoes-layout-context";

export function ConfigPageBack({ to = "/painel/configuracoes" }: { to?: string }) {
  const embedded = useConfiguracoesEmbedded();
  const tenantCtx = useTenantOptional();
  const backTo =
    tenantCtx && to.startsWith("/painel")
      ? (mapLegacyPainelPath(to, tenantCtx.tenant.slug) ?? to)
      : to;

  if (embedded) return null;

  return (
    <Link to={backTo} className="inline-block">
      <GestaoButton variant="secondary" size="sm">
        <ArrowLeft className="size-4" />
        Voltar para configurações
      </GestaoButton>
    </Link>
  );
}

export function ConfigHubCard({
  title,
  description,
  icon,
  badge,
  to,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  badge?: string;
  to: string;
}) {
  return (
    <Link to={to} className="block h-full">
      <article className="flex h-full flex-col rounded-2xl border border-[color:var(--honey-line)] bg-[linear-gradient(145deg,#fffefb,#f8f2e8)] p-5 transition hover:border-[#FF9100]/35 hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-sage text-primary-foreground">
            {icon}
          </div>
          {badge ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {badge}
            </span>
          ) : null}
        </div>
        <h3 className="mt-4 font-display text-xl text-[color:var(--gestao-ink)]">{title}</h3>
        <p className="mt-2 flex-1 text-sm text-muted-foreground">{description}</p>
      </article>
    </Link>
  );
}
