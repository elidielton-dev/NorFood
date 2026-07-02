import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, HelpCircle, Mail, MessageCircle, Phone } from "lucide-react";
import { ParceiroCard, ParceiroPage } from "@/routes/parceiro";

export const Route = createFileRoute("/parceiro/ajuda")({
  component: ParceiroAjudaPage,
});

const FAQ = [
  {
    q: "Como cadastrar um novo restaurante?",
    a: "Acesse Restaurantes → Novo ou gere um token em Tokens para o cliente se cadastrar sozinho.",
  },
  {
    q: "O que é um token de ativação?",
    a: "Link único com plano e trial definidos. Ao usar, o restaurante entra na sua carteira automaticamente.",
  },
  {
    q: "Posso acessar o painel do cliente?",
    a: "Sim. Em Restaurantes, use Abrir painel para impersonate seguro com retorno automático.",
  },
  {
    q: "Como funciona a cobrança?",
    a: "Você cobra seus restaurantes. A Norfood cobra sua revendedora conforme licenças ativas — veja Financeiro.",
  },
  {
    q: "Quantos restaurantes posso ter?",
    a: "Até o limite de licenças contratado. Acompanhe em Início ou Configurações.",
  },
];

const GUIDES = [
  { title: "Primeiros passos do hiperador", to: "/parceiro/academia", desc: "Onboarding em 15 minutos" },
  { title: "Gerar e compartilhar tokens", to: "/parceiro/tokens", desc: "Links de ativação" },
  { title: "Kit de marketing", to: "/parceiro/marketing", desc: "Mensagens e playbook" },
  { title: "Entender relatórios", to: "/parceiro/relatorios", desc: "Métricas da carteira" },
];

function ParceiroAjudaPage() {
  return (
    <ParceiroPage
      title="Central de ajuda"
      subtitle="Documentação, FAQ e canais de suporte para revendedoras NorFood."
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <ContactCard
            icon={Mail}
            title="E-mail"
            detail="suporte@norfood.com.br"
            href="mailto:suporte@norfood.com.br"
          />
          <ContactCard icon={MessageCircle} title="WhatsApp" detail="Canal comercial NorFood" href="#" />
          <ContactCard icon={Phone} title="Horário" detail="Seg–Sex, 9h–18h (Brasília)" />
        </div>

        <ParceiroCard title="Guias rápidos">
          <div className="grid gap-3 sm:grid-cols-2">
            {GUIDES.map((g) => (
              <Link
                key={g.title}
                to={g.to}
                className="flex items-start gap-3 rounded-xl border border-[#E5E7EB] p-4 hover:bg-[#F6F7F9]"
              >
                <BookOpen className="mt-0.5 size-5 text-[#FF9100]" />
                <div>
                  <p className="text-sm font-semibold text-[#111111]">{g.title}</p>
                  <p className="text-xs text-[#6B7280]">{g.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </ParceiroCard>

        <ParceiroCard title="Perguntas frequentes">
          <div className="divide-y divide-[#E5E7EB]">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4 first:pt-0 last:pb-0">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-[#111111] marker:content-none">
                  <HelpCircle className="size-4 text-[#FF9100]" />
                  {item.q}
                </summary>
                <p className="mt-2 pl-6 text-sm text-[#6B7280]">{item.a}</p>
              </details>
            ))}
          </div>
        </ParceiroCard>
      </div>
    </ParceiroPage>
  );
}

function ContactCard({
  icon: Icon,
  title,
  detail,
  href,
}: {
  icon: typeof Mail;
  title: string;
  detail: string;
  href?: string;
}) {
  const inner = (
    <>
      <Icon className="size-5 text-[#FF9100]" />
      <p className="mt-2 text-sm font-semibold text-[#111111]">{title}</p>
      <p className="text-xs text-[#6B7280]">{detail}</p>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className="rounded-2xl border border-[#E5E7EB] bg-white p-4 hover:border-[#FF9100]/40"
      >
        {inner}
      </a>
    );
  }

  return <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">{inner}</div>;
}
