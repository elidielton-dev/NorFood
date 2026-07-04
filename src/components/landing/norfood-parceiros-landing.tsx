import type { FormEvent } from "react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Award,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  Handshake,
  Headphones,
  Layers,
  LineChart,
  Megaphone,
  Repeat,
  Shield,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { NorfoodLogo } from "@/components/brand/norfood-logo";
import { LandingCookieBanner } from "@/components/landing/landing-cookie-banner";
import { LandingSiteHeader } from "@/components/landing/landing-site-header";
import { ScrollReveal } from "@/components/landing/landing-scroll-reveal";

const BENEFITS = [
  {
    icon: Repeat,
    title: "Receita recorrente",
    desc: "Ganhe com mensalidades dos restaurantes da sua carteira mês a mês, com previsibilidade e escala.",
  },
  {
    icon: Layers,
    title: "Plataforma completa",
    desc: "Delivery, PDV, KDS, mesas, fiscal, WhatsApp e app entregador — tudo white-label NorFood.",
  },
  {
    icon: GraduationCap,
    title: "Academia e suporte",
    desc: "Onboarding, materiais de marketing e equipe NorFood ao lado na implantação e no pós-venda.",
  },
  {
    icon: Award,
    title: "Programa de níveis",
    desc: "Evolua de Bronze a Platinum com metas, conquistas e benefícios exclusivos para hiperadores.",
  },
  {
    icon: Megaphone,
    title: "Kit comercial",
    desc: "Scripts, apresentações e argumentos prontos para vender consultivamente na sua região.",
  },
  {
    icon: Shield,
    title: "Marca confiável",
    desc: "Infraestrutura em nuvem, LGPD e operação estável para você vender com segurança.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Cadastre-se no programa",
    desc: "Preencha o formulário ou fale com nosso time comercial. Avaliamos fit e região de atuação.",
  },
  {
    step: "02",
    title: "Ative seu portal parceiro",
    desc: "Receba acesso ao painel revendedor: tokens, CRM, financeiro e carteira de restaurantes.",
  },
  {
    step: "03",
    title: "Implante restaurantes",
    desc: "Cadastre clientes, gere tokens de ativação e acompanhe trials e conversões em tempo real.",
  },
  {
    step: "04",
    title: "Escale e fature",
    desc: "Aumente a carteira, suba de nível no programa e construa receita recorrente previsível.",
  },
];

const AUDIENCE = [
  {
    icon: Store,
    title: "Revendas de software",
    desc: "Para quem já atende PMEs com ERP, PDV ou automação e quer ampliar o portfólio.",
  },
  {
    icon: Users,
    title: "Consultores e agências",
    desc: "Profissionais que implantam soluções digitais em restaurantes e varejo alimentício.",
  },
  {
    icon: Target,
    title: "Representantes regionais",
    desc: "Empreendedores com rede local que buscam produto SaaS com comissionamento recorrente.",
  },
];

const PORTAL_FEATURES = [
  "Dashboard com metas e conquistas",
  "CRM de leads e pipeline comercial",
  "Tokens de ativação e carteira de restaurantes",
  "Pendências, trials e alertas automáticos",
  "Financeiro com boletos e faturas",
  "Academia NorFood e central de ajuda",
];

const FAQ = [
  {
    q: "Preciso ter CNPJ para ser parceiro?",
    a: "Sim. O programa é voltado a empresas e profissionais que atuam comercialmente com PMEs, preferencialmente com CNPJ ativo.",
  },
  {
    q: "Como funciona a remuneração?",
    a: "Você constrói uma carteira de restaurantes e recebe com base no modelo comercial acordado — mensalidades recorrentes e bonificações por metas trimestrais.",
  },
  {
    q: "A NorFood oferece suporte na implantação?",
    a: "Sim. Disponibilizamos academia, materiais, playbooks de venda e suporte técnico para você implantar clientes com agilidade.",
  },
  {
    q: "Posso atuar em qualquer região do Brasil?",
    a: "Analisamos região de atuação no cadastro para garantir boa cobertura comercial e suporte aos restaurantes.",
  },
  {
    q: "Já sou parceiro. Onde acesso o portal?",
    a: "Use o botão Entrar no topo da página para acessar o portal em /parceiro com seu login de revendedor.",
  },
];

const STATS = [
  { value: "+35", label: "funcionalidades no ecossistema" },
  { value: "24/7", label: "operação em nuvem" },
  { value: "100%", label: "foco em food service" },
  { value: "Nordeste+", label: "expansão nacional" },
];

export function NorfoodParceirosLanding() {
  return (
    <div className="norfood-landing min-h-screen overflow-x-hidden bg-white text-[#1A1A1A]">
      <LandingSiteHeader active="parceiros" />
      <HeroSection />
      <BenefitsSection />
      <StepsSection />
      <AudienceSection />
      <PortalSection />
      <StatsSection />
      <FaqSection />
      <ContactSection />
      <ParceirosFooter />
      <LandingCookieBanner />
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[#FFF8F0]">
      <div className="pointer-events-none absolute -right-32 top-0 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-[#FF9100]/25 to-[#FF5C00]/10 blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
        <ScrollReveal>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2.5 rounded-full bg-[#FF9100]" />
            ))}
          </div>
          <h1 className="mt-6 font-display text-4xl font-extrabold leading-tight text-[#1A1A1A] sm:text-5xl">
            Seja um parceiro{" "}
            <span className="bg-gradient-to-r from-[#FF9100] to-[#FF5C00] bg-clip-text text-transparent">
              NorFood
            </span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#5C4A3A]">
            Para você que tem revenda de software ou negócio que atende pequenas e médias empresas:
            amplie seu portfólio, construa{" "}
            <strong className="font-semibold text-[#1A1A1A]">receita recorrente</strong> e conquiste
            novos clientes com nosso programa de hiperadores.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#contato"
              className="inline-flex items-center gap-2 rounded-full bg-[#FF9100] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#FF9100]/30 transition hover:bg-[#FF5C00]"
            >
              <Handshake className="size-4" />
              Quero ser parceiro
            </a>
            <Link
              to="/login"
              search={{ redirect: "/parceiro" }}
              className="inline-flex items-center gap-2 rounded-full border-2 border-[#1A1A1A]/15 bg-white px-6 py-3.5 text-sm font-bold text-[#1A1A1A] transition hover:border-[#FF9100]/40 hover:text-[#FF9100]"
            >
              Acessar portal
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={120} className="relative flex justify-center lg:justify-end">
          <div className="absolute -right-8 top-1/2 z-0 h-[115%] w-[85%] max-w-md -translate-y-1/2 rounded-[999px] bg-gradient-to-br from-[#FF9100]/30 via-[#FF9100]/15 to-transparent" />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[#FF9100]/15 bg-white shadow-[0_24px_64px_rgba(255,145,0,0.18)]">
            <div className="aspect-[4/3] bg-gradient-to-br from-[#1A1A1A] via-[#2a2a2a] to-[#1A1A1A] p-8">
              <div className="flex h-full flex-col justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF9100]">
                    Portal Parceiro
                  </p>
                  <p className="mt-3 font-display text-2xl font-bold text-white">
                    Venda, implante e escale restaurantes
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: LineChart, label: "CRM & metas" },
                    { icon: Wallet, label: "Financeiro" },
                    { icon: Store, label: "Carteira" },
                    { icon: Zap, label: "Tokens" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
                    >
                      <item.icon className="size-4 shrink-0 text-[#FF9100]" />
                      <span className="text-xs font-medium text-white/90">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

function BenefitsSection() {
  return (
    <section id="beneficios" className="bg-white py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-[#FF9100]">Benefícios</p>
          <h2 className="mt-3 font-display text-3xl font-extrabold text-[#1A1A1A] sm:text-4xl">
            Por que ser hiperador NorFood?
          </h2>
          <p className="mt-4 text-[#5C4A3A]">
            Inspirado nos melhores programas de canal SaaS — com foco total em restaurantes, bares e
            deliveries.
          </p>
        </ScrollReveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 60}>
              <div className="h-full rounded-2xl border border-[#FF9100]/10 bg-[#FFF8F0]/50 p-6 transition hover:border-[#FF9100]/25 hover:shadow-lg hover:shadow-[#FF9100]/5">
                <div className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-[#FF9100] to-[#FF5C00] text-white shadow-md shadow-[#FF9100]/25">
                  <item.icon className="size-6" />
                </div>
                <h3 className="mt-5 font-display text-lg font-bold text-[#1A1A1A]">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#5C4A3A]">{item.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function StepsSection() {
  return (
    <section id="como-funciona" className="bg-[#1A1A1A] py-20 text-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-[#FF9100]">Como funciona</p>
          <h2 className="mt-3 font-display text-3xl font-extrabold sm:text-4xl">
            Do cadastro à receita recorrente
          </h2>
        </ScrollReveal>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((item, i) => (
            <ScrollReveal key={item.step} delay={i * 80}>
              <div className="relative h-full rounded-2xl border border-white/10 bg-white/5 p-6">
                <span className="font-display text-3xl font-extrabold text-[#FF9100]/40">
                  {item.step}
                </span>
                <h3 className="mt-4 font-display text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/75">{item.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function AudienceSection() {
  return (
    <section id="para-quem" className="bg-[#FFF8F0] py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-[#FF9100]">Para quem é</p>
          <h2 className="mt-3 font-display text-3xl font-extrabold text-[#1A1A1A] sm:text-4xl">
            Perfil ideal de parceiro
          </h2>
        </ScrollReveal>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {AUDIENCE.map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 80}>
              <div className="rounded-2xl border border-[#FF9100]/10 bg-white p-8 text-center shadow-sm">
                <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#FF9100]/10 text-[#FF9100]">
                  <item.icon className="size-8" />
                </div>
                <h3 className="mt-6 font-display text-xl font-bold">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#5C4A3A]">{item.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function PortalSection() {
  return (
    <section id="portal" className="bg-white py-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
        <ScrollReveal>
          <p className="text-sm font-bold uppercase tracking-widest text-[#FF9100]">
            Portal parceiro
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold text-[#1A1A1A] sm:text-4xl">
            Tudo que você precisa para vender e gerir a carteira
          </h2>
          <p className="mt-4 text-[#5C4A3A]">
            Painel profissional estilo hiperador: sidebar intuitiva, CRM, pendências, financeiro e
            academia — com identidade NorFood.
          </p>
          <ul className="mt-8 space-y-3">
            {PORTAL_FEATURES.map((feat) => (
              <li key={feat} className="flex items-start gap-3 text-sm text-[#1A1A1A]">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#FF9100]" />
                {feat}
              </li>
            ))}
          </ul>
          <Link
            to="/login"
            search={{ redirect: "/parceiro" }}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#333]"
          >
            Acessar portal parceiro
            <ArrowRight className="size-4" />
          </Link>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="rounded-2xl border border-[#E8EAED] bg-[#F6F7F9] p-6 shadow-xl">
            <div className="rounded-xl bg-[#111111] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#FF9100]" />
                <span className="text-xs font-medium text-white/80">portal.norfood.com.br/parceiro</span>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { label: "Clientes ativos", value: "12", icon: TrendingUp },
                { label: "Leads em aberto", value: "8", icon: BarChart3 },
                { label: "Pendências", value: "3", icon: Headphones },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-xl border border-[#E8EAED] bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <row.icon className="size-4 text-[#FF9100]" />
                    <span className="text-sm text-[#5C4A3A]">{row.label}</span>
                  </div>
                  <span className="font-display text-lg font-bold text-[#1A1A1A]">{row.value}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-[#6B7280]">
              Demonstração ilustrativa do portal parceiro NorFood
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

function StatsSection() {
  return (
    <section className="bg-gradient-to-r from-[#FF9100] to-[#FF5C00] py-16 text-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-display text-3xl font-extrabold sm:text-4xl">{stat.value}</p>
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

function FaqSection() {
  return (
    <section id="faq" className="bg-[#FFF8F0] py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <ScrollReveal className="text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-[#FF9100]">FAQ</p>
          <h2 className="mt-3 font-display text-3xl font-extrabold text-[#1A1A1A]">Dúvidas frequentes</h2>
        </ScrollReveal>

        <div className="mt-12 space-y-3">
          {FAQ.map((item, i) => (
            <ScrollReveal key={item.q} delay={i * 50}>
              <details className="group rounded-2xl border border-[#FF9100]/10 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-[#1A1A1A]">
                  {item.q}
                  <ChevronDown className="size-5 shrink-0 text-[#FF9100] transition group-open:rotate-180" />
                </summary>
                <p className="border-t border-[#F0F1F3] px-5 py-4 text-sm leading-relaxed text-[#5C4A3A]">
                  {item.a}
                </p>
              </details>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContactSection() {
  const [sent, setSent] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "");
    const email = String(fd.get("email") ?? "");
    const phone = String(fd.get("phone") ?? "");
    const company = String(fd.get("company") ?? "");
    const message = String(fd.get("message") ?? "");
    const subject = encodeURIComponent("Quero ser parceiro NorFood");
    const body = encodeURIComponent(
      `Nome: ${name}\nE-mail: ${email}\nTelefone: ${phone}\nEmpresa: ${company}\n\n${message}`,
    );
    window.location.href = `mailto:contato@norfood.com.br?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <section id="contato" className="bg-white py-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-start">
        <ScrollReveal>
          <p className="text-sm font-bold uppercase tracking-widest text-[#FF9100]">Contato</p>
          <h2 className="mt-3 font-display text-3xl font-extrabold text-[#1A1A1A] sm:text-4xl">
            Fale com a NorFood
          </h2>
          <p className="mt-4 text-[#5C4A3A]">
            Deixe seus dados e nosso time comercial entra em contato para apresentar o programa de
            parceiros, condições e próximos passos.
          </p>
          <div className="mt-8 space-y-4 text-sm text-[#5C4A3A]">
            <p>
              <strong className="text-[#1A1A1A]">E-mail:</strong>{" "}
              <a href="mailto:contato@norfood.com.br" className="text-[#FF9100] hover:underline">
                contato@norfood.com.br
              </a>
            </p>
            <p className="flex items-center gap-2">
              <Sparkles className="size-4 text-[#FF9100]" />
              Resposta em até 2 dias úteis
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={80}>
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-[#FF9100]/15 bg-[#FFF8F0]/60 p-6 shadow-lg sm:p-8"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" name="name" required placeholder="Seu nome" />
              <Field label="E-mail" name="email" type="email" required placeholder="voce@empresa.com" />
              <Field label="Telefone" name="phone" placeholder="(00) 00000-0000" />
              <Field label="Empresa" name="company" placeholder="Nome da empresa" />
            </div>
            <div className="mt-4">
              <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-[#1A1A1A]">
                Mensagem
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                placeholder="Conte sobre sua região, experiência e quantos clientes atende..."
                className="w-full rounded-xl border border-[#E8EAED] bg-white px-4 py-3 text-sm outline-none ring-[#FF9100]/30 transition focus:ring-2"
              />
            </div>
            <button
              type="submit"
              className="mt-6 w-full rounded-full bg-[#FF9100] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#FF9100]/25 transition hover:bg-[#FF5C00]"
            >
              Enviar interesse
            </button>
            {sent ? (
              <p className="mt-3 text-center text-xs text-[#5C4A3A]">
                Abrimos seu cliente de e-mail — confirme o envio para concluir.
              </p>
            ) : null}
          </form>
        </ScrollReveal>
      </div>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-[#1A1A1A]">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#E8EAED] bg-white px-4 py-3 text-sm outline-none ring-[#FF9100]/30 transition focus:ring-2"
      />
    </div>
  );
}

function ParceirosFooter() {
  return (
    <footer className="border-t border-[#E5E7EB] bg-[#1A1A1A] text-white">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <NorfoodLogo size="md" />
            <p className="mt-4 text-sm text-white/70">
              Programa de parceiros e hiperadores NorFood — delivery e gestão para restaurantes.
            </p>
          </div>
          <div>
            <h4 className="font-bold">Programa</h4>
            <ul className="mt-4 space-y-2 text-sm text-white/70">
              <li>
                <a href="#beneficios" className="hover:text-[#FF9100]">
                  Benefícios
                </a>
              </li>
              <li>
                <a href="#como-funciona" className="hover:text-[#FF9100]">
                  Como funciona
                </a>
              </li>
              <li>
                <a href="#contato" className="hover:text-[#FF9100]">
                  Cadastro
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold">Acesso</h4>
            <ul className="mt-4 space-y-2 text-sm text-white/70">
              <li>
                <Link to="/login" search={{ redirect: "/parceiro" }} className="hover:text-[#FF9100]">
                  Portal parceiro
                </Link>
              </li>
              <li>
                <Link to="/" className="hover:text-[#FF9100]">
                  Site NorFood
                </Link>
              </li>
              <li>
                <Link to="/cadastro" className="hover:text-[#FF9100]">
                  Cadastro restaurante
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold">Contato</h4>
            <ul className="mt-4 space-y-2 text-sm text-white/70">
              <li>
                <a href="mailto:contato@norfood.com.br" className="hover:text-[#FF9100]">
                  contato@norfood.com.br
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 border-t border-white/10 pt-8 text-center text-sm text-white/50">
          © {new Date().getFullYear()} NorFood — Programa de Parceiros. Feito com 🧡 no Nordeste.
        </div>
      </div>
    </footer>
  );
}
