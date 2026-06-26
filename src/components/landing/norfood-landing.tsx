import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bike,
  Building2,
  Clock,
  CreditCard,
  Flame,
  Heart,
  MapPin,
  PiggyBank,
  Shield,
  Smartphone,
  Sparkles,
  Store,
  Truck,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { NorfoodLogo } from "@/components/brand/norfood-logo";
import { LandingCookieBanner } from "@/components/landing/landing-cookie-banner";
import { LandingRestaurantSection } from "@/components/landing/landing-restaurant-section";
import { ScrollReveal } from "@/components/landing/landing-scroll-reveal";
import {
  LandingTestimonialsCarousel,
  type Testimonial,
} from "@/components/landing/landing-testimonials-carousel";
import { NORFOOD_DEMO_TENANT_SLUG } from "@/lib/tenant/constants";
import { lojaPath, tenantPath } from "@/lib/tenant/painel-routes";

const STEPS = [
  {
    emoji: "🏪",
    title: "Escolha sua loja preferida",
    desc: "Do boteco da esquina ao restaurante massa da cidade.",
  },
  {
    emoji: "🫔",
    title: "Selecione os produtos",
    desc: "Acarajé, tapioca, moqueca, pizza… cardápio na mão, sem pressão.",
  },
  {
    emoji: "💳",
    title: "Escolha como pagar",
    desc: "Pix, cartão ou na entrega. Prático igual mandar um zap.",
  },
  {
    emoji: "🛵",
    title: "Eita, chegou! Abre o sorrisão!",
    desc: "Acompanhe em tempo real e receba quentinho na sua porta.",
  },
];

const CATEGORIES = [
  { emoji: "🫔", label: "Tapiocarias" },
  { emoji: "🍤", label: "Acarajé & Baião" },
  { emoji: "🐟", label: "Moquecas" },
  { emoji: "🍕", label: "Pizzarias" },
  { emoji: "🍔", label: "Lanchonetes" },
  { emoji: "🥩", label: "Churrascarias" },
  { emoji: "🌽", label: "Cuscuz & Casa" },
  { emoji: "🧁", label: "Docerias" },
  { emoji: "🍦", label: "Sorveterias" },
  { emoji: "🛒", label: "Mercados" },
  { emoji: "💊", label: "Farmácias" },
  { emoji: "🐾", label: "Pet Shops" },
];

const ADVANTAGES = [
  {
    icon: Clock,
    title: "Ganhe tempo",
    desc: "Receba em casa e use seu tempo pro que importa: família, forró ou aquele cochilo de tarde.",
  },
  {
    icon: PiggyBank,
    title: "Economize dinheiro",
    desc: "Promoções da região e sem gastar com deslocamento. Seu bolso agradece, viu?",
  },
  {
    icon: Heart,
    title: "Comodidade",
    desc: "Chega de fila e ligação enrolada. Relaxa: a cidade tá na palma da mão.",
  },
];

const TESTIMONIALS: Testimonial[] = [
  {
    name: "Ana Beatriz",
    city: "Recife, PE",
    text: "Oxente, que praticidade! Peço o acarajé da minha baiana favorita sem sair do sofá. Arretado demais!",
  },
  {
    name: "João Pedro",
    city: "Fortaleza, CE",
    text: "Uso pra pedir almoço no trabalho todo dia. Rastreio o motoboy e pago no Pix. Massa!",
  },
  {
    name: "Maria Clara",
    city: "Salvador, BA",
    text: "Minha mãe adorou! Cardápio fácil, entrega rápida. NorFood facilitou a vida da família toda.",
  },
  {
    name: "Raimundo",
    city: "Natal, RN",
    text: "Sou dono de lanchonete e o painel é show. KDS, delivery e balcão num lugar só. Eita sistema bom!",
  },
];

const STATS = [
  { value: "+500", label: "restaurantes parceiros" },
  { value: "+9", label: "estados do Nordeste" },
  { value: "+120", label: "cidades atendidas" },
  { value: "24/7", label: "pedidos rolando" },
];

export function NorfoodLanding() {
  return (
    <div className="norfood-landing min-h-screen overflow-x-hidden bg-[#FFF8F0] text-[#1A1A1A]">
      <LandingHeader />

      <HeroSection />
      <StepsSection />
      <FeaturesSection />
      <LandingRestaurantSection />
      <CategoriesSection />
      <StatsSection />
      <AdvantagesSection />
      <TestimonialsSection />
      <PartnerCtaSection />
      <LandingFooter />
      <LandingCookieBanner />
    </div>
  );
}

function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#FF9100]/15 bg-white/95 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/">
          <NorfoodLogo size="md" />
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-[#5C4A3A] md:flex">
          <a href="#como-funciona" className="transition hover:text-[#FF9100]">
            Como pedir
          </a>
          <a href="#categorias" className="transition hover:text-[#FF9100]">
            Categorias
          </a>
          <a href="#para-restaurantes" className="transition hover:text-[#FF9100]">
            Restaurantes
          </a>
          <a href="#vantagens" className="transition hover:text-[#FF9100]">
            Vantagens
          </a>
          <a href="#depoimentos" className="transition hover:text-[#FF9100]">
            Depoimentos
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/cadastro"
            className="hidden rounded-full border-2 border-[#FF9100] px-4 py-2 text-sm font-semibold text-[#FF9100] transition hover:bg-[#FF9100]/10 sm:inline-flex"
          >
            Quero ser parceiro
          </Link>
          <Link
            to={lojaPath(NORFOOD_DEMO_TENANT_SLUG)}
            className="rounded-full bg-[#FF9100] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-[#FF9100]/30 transition hover:bg-[#FF5C00]"
          >
            Pedir agora
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-20 -top-20 size-96 rounded-full bg-[#FF9100]/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 size-80 rounded-full bg-[#F5C842]/25 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, #FF9100 0, #FF9100 1px, transparent 0, transparent 50%)",
            backgroundSize: "12px 12px",
          }}
        />
      </div>

      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
        <ScrollReveal>
          <span className="inline-flex items-center gap-2 rounded-full bg-[#FF9100]/15 px-4 py-1.5 text-sm font-semibold text-[#C45C26]">
            <Flame className="size-4" />
            Nordeste arretado de verdade
          </span>
          <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-[#1A1A1A] sm:text-5xl lg:text-[3.25rem]">
            Aproveite a vida.
            <span className="mt-2 block text-[#FF9100]">O resto a NorFood entrega pra você.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#5C4A3A]">
            Receba suas compras em casa — do acarajé à feira — e use seu tempo pro que realmente
            importa: família, praia, forró ou aquele chimarrão de domingo.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={lojaPath(NORFOOD_DEMO_TENANT_SLUG)}
              className="inline-flex items-center gap-2 rounded-full bg-[#FF9100] px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#FF9100]/35 transition hover:scale-[1.02] hover:bg-[#FF5C00]"
            >
              <Smartphone className="size-4" />
              Pedir na loja demo
            </Link>
            <Link
              to="/cadastro"
              className="inline-flex items-center gap-2 rounded-full border-2 border-[#1A1A1A]/15 bg-white px-7 py-3.5 text-sm font-bold text-[#1A1A1A] transition hover:border-[#FF9100]/40 hover:bg-[#FF9100]/5"
            >
              <Store className="size-4" />
              Tenho um restaurante
            </Link>
          </div>
          <p className="mt-4 text-sm text-[#8B7355]">
            Oxente, é molezinha! Sem baixar app — pede direto pelo navegador.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={150} className="relative flex justify-center lg:justify-end">
          <PhoneMockup />
          <div className="absolute -bottom-4 -left-4 hidden rounded-2xl border border-[#FF9100]/20 bg-white p-4 shadow-xl lg:block">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#FF9100]">Ao vivo</p>
            <p className="mt-1 text-sm font-bold">Seu pedido saiu! 🛵</p>
            <p className="text-xs text-[#8B7355]">Chega em ~18 min</p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

function PhoneMockup() {
  const slides = [
    {
      title: "Eita, que fome!",
      subtitle: "O que vai pedir hoje, mainha?",
      items: ["🫔 Tapioca de carne de sol", "🍤 Acarajé especial", "🐟 Moqueca capixaba"],
      badge: "☀️ Quentinho!",
    },
    {
      title: "Pedido #104",
      subtitle: "Acompanhe em tempo real",
      items: ["✅ Confirmado", "👨‍🍳 Preparando", "🛵 Saiu para entrega"],
      badge: "📍 ~12 min",
    },
    {
      title: "Pagamento fácil",
      subtitle: "Pix, cartão ou na entrega",
      items: ["💚 Pix aprovado", "🔒 Dados seguros", "🧾 Recibo no app"],
      badge: "✨ Massa!",
    },
  ];

  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % slides.length);
    }, 4000);
    return () => window.clearInterval(id);
  }, [slides.length]);

  const current = slides[slide];

  return (
    <div className="relative w-[min(100%,280px)] animate-float">
      <div className="rounded-[2.5rem] border-[10px] border-[#1A1A1A] bg-[#1A1A1A] p-2 shadow-2xl">
        <div className="overflow-hidden rounded-[1.75rem] bg-gradient-to-b from-[#FF9100] to-[#FF5C00] p-4 text-white">
          <div className="flex items-center justify-between text-xs font-medium opacity-90">
            <span>NorFood</span>
            <span>14:32</span>
          </div>
          <div key={slide} className="landing-carousel-enter">
            <p className="mt-6 text-lg font-bold leading-tight">{current.title}</p>
            <p className="mt-1 text-sm opacity-90">{current.subtitle}</p>
            <div className="mt-4 space-y-2">
              {current.items.map((item) => (
                <div
                  key={item}
                  className="rounded-xl bg-white/20 px-3 py-2 text-sm font-medium backdrop-blur-sm"
                >
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-white px-3 py-2.5 text-center text-sm font-bold text-[#FF9100]">
              {slide === 0 ? "Ver cardápio completo" : slide === 1 ? "Rastrear pedido" : "Pagar com Pix"}
            </div>
          </div>
          <div className="mt-3 flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === slide ? "w-5 bg-white" : "w-1.5 bg-white/40"}`}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -right-6 top-12 rounded-full bg-[#F5C842] px-3 py-1.5 text-xs font-bold text-[#1A1A1A] shadow-lg transition-all">
        {current.badge}
      </div>
    </div>
  );
}

function StepsSection() {
  return (
    <section id="como-funciona" className="bg-white py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center">
          <ScrollReveal>
            <h2 className="font-display text-3xl font-extrabold text-[#1A1A1A] sm:text-4xl">
              Veja como é molezinha fazer seu pedido
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[#5C4A3A]">
              Igual o jeito nordestino: simples, direto e sem enrolação.
            </p>
          </ScrollReveal>
        </div>
        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <ScrollReveal key={step.title} delay={i * 100} className="group relative text-center">
              {i < STEPS.length - 1 ? (
                <div className="absolute left-[calc(50%+2.5rem)] top-10 hidden h-0.5 w-[calc(100%-5rem)] bg-gradient-to-r from-[#FF9100]/40 to-transparent lg:block" />
              ) : null}
              <div className="mx-auto grid size-20 place-items-center rounded-2xl bg-gradient-to-br from-[#FFF0E0] to-[#FFE4C4] text-4xl shadow-inner transition group-hover:scale-105">
                {step.emoji}
              </div>
              <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[#FF9100]">
                Passo {i + 1}
              </p>
              <h3 className="mt-2 font-display text-lg font-bold text-[#1A1A1A]">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5C4A3A]">{step.desc}</p>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="bg-[#FFF8F0] py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-sm font-bold uppercase tracking-widest text-[#FF9100]">
          E você ainda pode…
        </p>
        <h2 className="mt-2 text-center font-display text-3xl font-extrabold text-[#1A1A1A] sm:text-4xl">
          Muito mais que delivery
        </h2>

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          <FeatureCard
            icon={MapPin}
            title="Ver seu pedido em tempo real"
            desc="Não sou Big Brother, mas deixo você de olho. Acompanhe da cozinha até o motoboy chegar na porta — sem ficar no vácuo."
            visual={
              <div className="space-y-3 p-2">
                {[
                  { label: "Pedido confirmado", done: true },
                  { label: "Preparando com carinho", done: true },
                  { label: "Saiu para entrega", done: true, active: true },
                  { label: "Chegou! Eita!", done: false },
                ].map((s) => (
                  <div
                    key={s.label}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
                      s.active
                        ? "bg-[#FF9100] text-white shadow-md"
                        : s.done
                          ? "bg-white text-[#1A1A1A]"
                          : "bg-white/60 text-[#8B7355]"
                    }`}
                  >
                    <span
                      className={`size-2.5 rounded-full ${s.done ? "bg-[#FF9100]" : "bg-[#E5D5C5]"}`}
                    />
                    {s.label}
                  </div>
                ))}
              </div>
            }
          />
          <FeatureCard
            icon={CreditCard}
            title="Pagar direto no app"
            desc="Nem precisa mexer no bolso. Pix, cartão ou na entrega — cadastrou uma vez e tá pago, massa!"
            visual={
              <div className="flex flex-col items-center justify-center gap-4 p-6">
                <div className="flex gap-3">
                  <div className="rounded-xl bg-[#32BCAD] px-4 py-3 text-sm font-bold text-white">
                    Pix
                  </div>
                  <div className="rounded-xl bg-[#1A1A1A] px-4 py-3 text-sm font-bold text-white">
                    Cartão
                  </div>
                  <div className="rounded-xl bg-[#FF9100] px-4 py-3 text-sm font-bold text-white">
                    Na entrega
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#1A1A1A] shadow">
                  <Wallet className="size-4 text-[#FF9100]" />
                  Pagamento seguro
                </div>
              </div>
            }
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
  visual,
}: {
  icon: typeof MapPin;
  title: string;
  desc: string;
  visual: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-[#FF9100]/15 bg-white shadow-lg shadow-[#FF9100]/5">
      <div className="bg-gradient-to-br from-[#FFF0E0] to-white p-6">{visual}</div>
      <div className="p-6">
        <div className="flex size-12 items-center justify-center rounded-xl bg-[#FF9100]/15 text-[#FF9100]">
          <Icon className="size-6" />
        </div>
        <h3 className="mt-4 font-display text-xl font-bold text-[#1A1A1A]">{title}</h3>
        <p className="mt-2 leading-relaxed text-[#5C4A3A]">{desc}</p>
      </div>
    </div>
  );
}

function CategoriesSection() {
  return (
    <section id="categorias" className="bg-white py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-center font-display text-3xl font-extrabold text-[#1A1A1A] sm:text-4xl">
          O que você quer? Relaxa!
          <span className="mt-2 block text-[#FF9100]">Entrego onde você estiver 😉</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-[#5C4A3A]">
          Do sertão ao litoral: sabores nordestinos e muito mais na palma da mão.
        </p>
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.label}
              to={lojaPath(NORFOOD_DEMO_TENANT_SLUG)}
              className="group flex flex-col items-center rounded-2xl border border-transparent bg-[#FFF8F0] p-5 text-center transition hover:border-[#FF9100]/30 hover:bg-[#FF9100]/10 hover:shadow-md"
            >
              <span className="text-4xl transition group-hover:scale-110">{cat.emoji}</span>
              <span className="mt-3 text-sm font-semibold text-[#1A1A1A]">{cat.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatsSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#FF9100] via-[#FF7A00] to-[#FF5C00] py-20 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-center font-display text-3xl font-extrabold sm:text-4xl">
          Vamos pintar o Nordeste de laranja 🧡
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-white/90">
          Uma paixão quente que não cabe no peito — e nem na fome!
        </p>
        <div className="mt-14 grid grid-cols-2 gap-8 lg:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-display text-4xl font-extrabold sm:text-5xl">{stat.value}</p>
              <p className="mt-2 text-sm font-medium uppercase tracking-wide text-white/85">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AdvantagesSection() {
  return (
    <section id="vantagens" className="bg-[#FFF8F0] py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-center font-display text-3xl font-extrabold text-[#1A1A1A] sm:text-4xl">
          Aí eu vi vantagem!
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-[#5C4A3A]">
          Porque nordestino sabe: tempo é dinheiro e comodidade não tem preço.
        </p>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {ADVANTAGES.map((adv) => (
            <div
              key={adv.title}
              className="rounded-3xl border border-[#FF9100]/10 bg-white p-8 text-center shadow-sm transition hover:shadow-lg"
            >
              <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-[#FF9100] to-[#FF5C00] text-white shadow-lg shadow-[#FF9100]/30">
                <adv.icon className="size-8" />
              </div>
              <h3 className="mt-6 font-display text-xl font-bold text-[#1A1A1A]">{adv.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#5C4A3A]">{adv.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section id="depoimentos" className="bg-white py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <ScrollReveal className="text-center">
          <h2 className="font-display text-3xl font-extrabold text-[#1A1A1A] sm:text-4xl">
            Ahhh, meus norfoodies 💛
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[#5C4A3A]">
            Uma paixão laranja que não cabe no peito.
          </p>
        </ScrollReveal>
        <div className="mt-12">
          <LandingTestimonialsCarousel items={TESTIMONIALS} />
        </div>
      </div>
    </section>
  );
}

function PartnerCtaSection() {
  return (
    <section className="bg-[#1A1A1A] py-20 text-white">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-[#FF9100]">
            Só um pedido
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold sm:text-4xl">
            Me leva com você, seu lindo!
          </h2>
          <p className="mt-4 text-lg text-white/80">
            Tem restaurante, lanchonete ou delivery? Entre pro time NorFood e tenha PDV, cozinha,
            entregadores e cardápio digital num lugar só.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/cadastro"
              className="inline-flex items-center gap-2 rounded-full bg-[#FF9100] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#FF5C00]"
            >
              <Sparkles className="size-4" />
              Quero ser parceiro
            </Link>
            <Link
              to={tenantPath(NORFOOD_DEMO_TENANT_SLUG, "dashboard")}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Ver painel demo
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: UtensilsCrossed, label: "Cardápio digital" },
            { icon: Bike, label: "App entregador" },
            { icon: Shield, label: "Dados seguros" },
            { icon: Building2, label: "Multilojas" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/5 p-6 text-center"
            >
              <item.icon className="size-8 text-[#FF9100]" />
              <p className="mt-3 text-sm font-semibold">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-[#E5E7EB] bg-white">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <NorfoodLogo size="md" />
            <p className="mt-4 text-sm text-[#5C4A3A]">
              Sistema de delivery nordestino. Quente, acolhedor e sem enrolação.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-[#1A1A1A]">NorFood</h4>
            <ul className="mt-4 space-y-2 text-sm text-[#5C4A3A]">
              <li>
                <a href="#como-funciona" className="hover:text-[#FF9100]">
                  Como pedir
                </a>
              </li>
              <li>
                <a href="#para-restaurantes" className="hover:text-[#FF9100]">
                  Para restaurantes
                </a>
              </li>
              <li>
                <Link to="/cadastro" className="hover:text-[#FF9100]">
                  Seja parceiro
                </Link>
              </li>
              <li>
                <Link to={tenantPath(NORFOOD_DEMO_TENANT_SLUG, "dashboard")} className="hover:text-[#FF9100]">
                  Painel gestor
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-[#1A1A1A]">Acesso</h4>
            <ul className="mt-4 space-y-2 text-sm text-[#5C4A3A]">
              <li>
                <Link to="/login" className="hover:text-[#FF9100]">
                  Entrar
                </Link>
              </li>
              <li>
                <Link to="/selecionar-empresa" className="hover:text-[#FF9100]">
                  Selecionar empresa
                </Link>
              </li>
              <li>
                <Link to="/admin" className="hover:text-[#FF9100]">
                  Admin plataforma
                </Link>
              </li>
              <li>
                <Link to="/entregador" className="hover:text-[#FF9100]">
                  Área do entregador
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-[#1A1A1A]">Precisando de ajuda?</h4>
            <ul className="mt-4 space-y-2 text-sm text-[#5C4A3A]">
              <li>
                <a href="mailto:contato@norfood.com.br" className="hover:text-[#FF9100]">
                  contato@norfood.com.br
                </a>
              </li>
              <li>
                <Link to={lojaPath(NORFOOD_DEMO_TENANT_SLUG)} className="hover:text-[#FF9100]">
                  Loja demonstração
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[#E5E7EB] pt-8 text-center text-sm text-[#8B7355] sm:flex-row sm:text-left">
          <p>© {new Date().getFullYear()} NorFood — Sistema de Delivery. Feito com 🧡 no Nordeste.</p>
          <p className="flex items-center gap-1">
            <Truck className="size-4 text-[#FF9100]" />
            Entregamos onde você estiver
          </p>
        </div>
      </div>
    </footer>
  );
}
