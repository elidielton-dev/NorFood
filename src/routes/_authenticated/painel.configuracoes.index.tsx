import { createFileRoute, Link } from "@tanstack/react-router";
import { getConfigHubSections } from "@/lib/painel-configuracoes-hub";
import { ConfigHubCard } from "@/components/config-hub-ui";
import { GestaoCard, GestaoPage, GestaoSectionTitle } from "@/components/gestao-ui";
import { lojaPath, tenantPath } from "@/lib/tenant/painel-routes";
import { useTenant } from "@/lib/tenant/tenant-context";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/")({
  component: ConfiguracoesIndexPage,
});

function ConfiguracoesIndexPage() {
  const { tenant } = useTenant();
  const hubSections = getConfigHubSections(tenant.slug);

  return (
    <GestaoPage
      title="Configurações"
      subtitle="Central de ajustes da loja: operação, mesas, pagamentos, integrações e equipe."
      actions={
        <a
          href={lojaPath(tenant.slug)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--honey-line)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--gestao-ink)] hover:border-[#FF9100]/40"
        >
          <ExternalLink className="size-4" />
          Ver loja online
        </a>
      }
    >
      <div className="space-y-8">
        {hubSections.map((section) => (
          <section key={section.key}>
            <GestaoCard className="border-none bg-transparent p-0 shadow-none">
              <GestaoSectionTitle title={section.title} description={section.description} />
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {section.items.map((item) => (
                  <ConfigHubCard
                    key={item.key}
                    title={item.title}
                    description={item.description}
                    to={item.to}
                    badge={item.badge}
                    icon={<item.icon className="size-5" />}
                  />
                ))}
              </div>
            </GestaoCard>
          </section>
        ))}

        <GestaoCard className="border-dashed">
          <p className="text-sm text-muted-foreground">
            Módulos operacionais (PDV, KDS, mesas ao vivo, delivery) continuam no menu principal.
            Aqui você configura <strong>como a loja funciona</strong>, não o dia a dia dos pedidos.
          </p>
          <Link
            to={tenantPath(tenant.slug, "atendimento/configuracoes")}
            className="mt-3 inline-block text-sm font-semibold text-sage underline"
          >
            Configurações do WhatsApp / atendimento
          </Link>
        </GestaoCard>
      </div>
    </GestaoPage>
  );
}
