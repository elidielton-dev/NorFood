import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Palette, Store } from "lucide-react";
import { fetchOperationalAdminServer } from "@/lib/api/operational-config.functions";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import logo from "@/assets/logo-norfood.png";
import { NORFOOD_BRAND_NAME, NORFOOD_TAGLINE } from "@/lib/brand/norfood";
import { GestaoCard, GestaoPage, GestaoSectionTitle } from "@/components/gestao-ui";

export const Route = createFileRoute("/_authenticated/painel/estabelecimento/visual")({
  component: EstabelecimentoVisualPage,
});

function EstabelecimentoVisualPage() {
  const tenantSlug = useTenantSlug();
  const { data } = useQuery({
    queryKey: ["operational-admin", tenantSlug],
    queryFn: () => fetchOperationalAdminServer({ data: tenantSlug }),
  });

  const config = data?.config;

  return (
    <GestaoPage
      title="Visual e descricao"
      subtitle="Identidade da loja exibida no painel e na experiencia do cliente"
    >
      <GestaoCard>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <img
            src={logo}
            alt={NORFOOD_BRAND_NAME}
            className="h-24 w-auto max-w-[14rem] object-contain"
          />
          <div className="flex-1 space-y-3">
            <GestaoSectionTitle
              title={NORFOOD_BRAND_NAME}
              description={NORFOOD_TAGLINE}
              action={<Store className="size-5 text-sage" />}
            />
            <p className="text-sm text-muted-foreground">
              Loja {config?.loja_aberta ? "aberta" : "fechada"} · Pedido minimo{" "}
              {config ? `R$ ${Number(config.pedido_minimo).toFixed(2)}` : "—"} · Entrega padrao{" "}
              {config ? `R$ ${Number(config.valor_padrao_entrega).toFixed(2)}` : "—"}
            </p>
          </div>
        </div>
      </GestaoCard>

      <GestaoCard>
        <GestaoSectionTitle
          title="Paleta e tipografia"
          description="Sistema visual NorFood aplicado em todo o painel gestao-ui."
          action={<Palette className="size-5 text-[color:var(--gestao-gold-deep)]" />}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <div className="h-12 w-20 rounded-xl bg-sage" title="Laranja NorFood" />
          <div className="h-12 w-20 rounded-xl bg-[color:var(--gestao-gold-deep)]" title="Laranja escuro" />
          <div className="h-12 w-20 rounded-xl bg-[color:var(--gestao-cream)]" title="Fundo" />
          <div className="h-12 w-20 rounded-xl bg-[color:var(--gestao-ink)]" title="Ink" />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Personalizacao avancada de logo, banner e textos da vitrine pode ser evoluida nesta tela.
        </p>
      </GestaoCard>
    </GestaoPage>
  );
}
