import { Link } from "@tanstack/react-router";
import { CreditCard, Mail, ShieldOff, Store, XCircle } from "lucide-react";
import { NorfoodLogo } from "@/components/brand/norfood-logo";
import type { TenantAccessReason } from "@/lib/tenant/tenant-access.server";
import { tenantPath } from "@/lib/tenant/painel-routes";
import { cn } from "@/lib/utils";

const SUPPORT_EMAIL = "suporte@norfood.com.br";

type TenantSuspendedScreenProps = {
  slug: string;
  tenantName?: string | null;
  message: string;
  reason: TenantAccessReason;
  suspensionKind?: "admin" | "billing" | null;
  canAccessBillingPage?: boolean;
  mode?: "loja" | "painel" | "standalone";
};

export function TenantSuspendedScreen({
  slug,
  tenantName,
  message,
  reason,
  suspensionKind,
  canAccessBillingPage = false,
  mode = "standalone",
}: TenantSuspendedScreenProps) {
  const isBilling =
    suspensionKind === "billing" || reason === "overdue" || reason === "trial_expired";
  const isAdmin = suspensionKind === "admin" || (reason === "suspended" && !isBilling);

  const planoHref = tenantPath(slug, "estabelecimento/plano");
  const headline = isBilling ? "Conta suspensa por pendência" : "Sua conta está suspensa";
  const subtitle = isBilling
    ? "Regularize o plano ou pagamento para voltar a usar o painel e a loja online."
    : "O acesso ao painel e à loja online foi interrompido. Entre em contato com nosso suporte para mais informações.";

  return (
    <div className="min-h-screen bg-[#F6F7F9] px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 flex justify-center">
          <NorfoodLogo size="lg" />
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-sm">
          <div
            className={cn(
              "mx-auto mb-6 grid size-16 place-items-center rounded-full",
              isBilling ? "bg-[#FFF7ED]" : "bg-rose-50",
            )}
          >
            {isBilling ? (
              <CreditCard className="size-8 text-[#FF9100]" />
            ) : (
              <ShieldOff className="size-8 text-rose-600" />
            )}
          </div>

          <p
            className={cn(
              "text-center text-xs font-semibold uppercase tracking-wider",
              isBilling ? "text-[#FF9100]" : "text-rose-600",
            )}
          >
            {mode === "loja" ? "Loja indisponível" : mode === "painel" ? "Painel bloqueado" : "Conta suspensa"}
          </p>

          <h1 className="mt-2 text-center text-2xl font-semibold text-[#111111]">{headline}</h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-[#6B7280]">{subtitle}</p>

          {tenantName ? (
            <p className="mt-4 text-center text-sm text-[#111111]">
              Restaurante: <strong>{tenantName}</strong>
            </p>
          ) : null}

          <div className="mt-6 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] p-4 text-sm text-[#374151]">
            <p className="font-medium text-[#111111]">Motivo informado</p>
            <p className="mt-2 leading-relaxed">{message}</p>
          </div>

          <div className="mt-6 space-y-3 text-sm text-[#5C4A3A]">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
              <span>O painel fica indisponível enquanto a conta estiver suspensa.</span>
            </div>
            <div className="flex items-start gap-3">
              <Store className="mt-0.5 size-4 shrink-0 text-rose-500" />
              <span>A loja online fica offline para novos pedidos.</span>
            </div>
            {isAdmin ? (
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-[#FF9100]" />
                <span>
                  Para contestar ou regularizar, fale com{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-[#FF9100] hover:underline">
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            {isBilling && canAccessBillingPage ? (
              <Link
                to={planoHref}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-[#FF9100] text-sm font-medium text-white hover:bg-[#FF5C00]"
              >
                Ir para plano e pagamento
              </Link>
            ) : (
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Conta suspensa — ${tenantName ?? slug}`)}`}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-[#111111] text-sm font-medium text-white hover:bg-[#333]"
              >
                Falar com suporte
              </a>
            )}
            <Link
              to="/"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-[#E5E7EB] text-sm font-medium text-[#111111]"
            >
              Voltar ao site
            </Link>
          </div>

          <p className="mt-6 text-center text-xs text-[#6B7280]">
            Referência: <span className="font-mono">norfood.com.br/conta-suspensa/{slug}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
