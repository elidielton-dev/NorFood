import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  ChefHat,
  ClipboardList,
  Settings,
  Store,
} from "lucide-react";
import { ScrollReveal } from "@/components/landing/landing-scroll-reveal";
import { NORFOOD_DEMO_TENANT_SLUG } from "@/lib/tenant/constants";
import { tenantPath } from "@/lib/tenant/painel-routes";

const RESTAURANT_STEPS = [
  {
    icon: Store,
    title: "Cadastre seu restaurante",
    desc: "Crie sua conta em minutos. Nome, logo, cores — sua marca do seu jeito.",
  },
  {
    icon: ClipboardList,
    title: "Monte o cardápio",
    desc: "Produtos, categorias, horários e taxa de entrega. Tudo no painel, sem planilha.",
  },
  {
    icon: ChefHat,
    title: "Receba pedidos",
    desc: "Delivery, balcão, mesas e KDS integrados. Cozinha e salão na mesma batida.",
  },
  {
    icon: BarChart3,
    title: "Gerencie e cresça",
    desc: "Relatórios, financeiro, entregadores e atendimento. Oxente, é completo!",
  },
];

export function LandingRestaurantSection() {
  return (
    <section id="para-restaurantes" className="relative overflow-hidden bg-[#1A1A1A] py-20 text-white">
      <div className="pointer-events-none absolute -right-32 top-0 size-96 rounded-full bg-[#FF9100]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 size-80 rounded-full bg-[#F5C842]/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <ScrollReveal className="text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-[#FF9100]">
            Para restaurantes
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold sm:text-4xl">
            Tem negócio de comida? Bora pro time!
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/75">
            Do boteco de bairro ao restaurante cheio — NorFood coloca PDV, cozinha, delivery e
            gestão num painel só. Sem complicação, no jeito nordestino.
          </p>
        </ScrollReveal>

        <div className="mt-16 grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="space-y-4">
            {RESTAURANT_STEPS.map((step, i) => (
              <ScrollReveal key={step.title} delay={i * 80}>
                <div className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-[#FF9100]/40 hover:bg-white/10">
                  <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#FF9100] text-white">
                    <step.icon className="size-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#FF9100]">
                      Passo {i + 1}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-bold">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/70">{step.desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal delay={120}>
            <DashboardMockup />
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/cadastro"
                className="inline-flex items-center gap-2 rounded-full bg-[#FF9100] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#FF5C00]"
              >
                Começar grátis
                <ArrowRight className="size-4" />
              </Link>
              <Link
                to={tenantPath(NORFOOD_DEMO_TENANT_SLUG, "dashboard")}
                className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                <Settings className="size-4" />
                Explorar painel demo
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

function DashboardMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/15 bg-[#252525] shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#1A1A1A] px-4 py-3">
        <div className="size-3 rounded-full bg-[#FF5C00]" />
        <div className="size-3 rounded-full bg-[#F5C842]" />
        <div className="size-3 rounded-full bg-[#32BCAD]" />
        <span className="ml-2 text-xs font-medium text-white/50">Painel NorFood</span>
      </div>
      <div className="grid grid-cols-[4.5rem_1fr]">
        <div className="space-y-2 border-r border-white/10 bg-[#1A1A1A] p-3">
          {["🏠", "🛵", "👨‍🍳", "📦", "📊"].map((icon, i) => (
            <div
              key={icon}
              className={`grid size-10 place-items-center rounded-lg text-lg ${
                i === 2 ? "bg-[#FF9100]/25 ring-1 ring-[#FF9100]/50" : "bg-white/5"
              }`}
            >
              {icon}
            </div>
          ))}
        </div>
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#FF9100]">KDS · Ao vivo</p>
          <div className="mt-3 space-y-2">
            {[
              { id: "#102", item: "2× Acarajé", status: "Preparando", tone: "bg-[#FF9100]" },
              { id: "#103", item: "Tapioca + Suco", status: "Novo", tone: "bg-[#32BCAD]" },
              { id: "#101", item: "Marmita fit", status: "Pronto", tone: "bg-[#F5C842] text-[#1A1A1A]" },
            ].map((order, i) => (
              <div
                key={order.id}
                className="landing-kds-pulse flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5"
                style={{ animationDelay: `${i * 0.4}s` }}
              >
                <div>
                  <p className="text-sm font-bold">{order.id}</p>
                  <p className="text-xs text-white/60">{order.item}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${order.tone}`}>
                  {order.status}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: "Hoje", value: "R$ 1.2k" },
              { label: "Pedidos", value: "47" },
              { label: "Ticket", value: "R$ 26" },
            ].map((m) => (
              <div key={m.label} className="rounded-lg bg-white/5 p-2 text-center">
                <p className="text-[10px] uppercase text-white/50">{m.label}</p>
                <p className="font-display text-sm font-bold text-[#FF9100]">{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
