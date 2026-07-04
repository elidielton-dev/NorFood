import type { ResellerTenantRow } from "@/lib/reseller/types";
import type { ParceiroAchievement } from "@/lib/parceiro/achievements";

export type ParceiroTimelinePost = {
  id: string;
  date: string;
  title: string;
  excerpt: string;
  type: "release" | "tip" | "academy";
};

export type ParceiroBannerContentSlide = {
  id: string;
  kind: "content";
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  accent: string;
};

export type ParceiroBannerImageSlide = {
  id: string;
  kind: "image";
  imageKey: "quero-delivery";
  alt: string;
  href?: string;
};

export type ParceiroBannerSlide = ParceiroBannerContentSlide | ParceiroBannerImageSlide;

export type ParceiroProfileDimension = {
  id: string;
  label: string;
  score: number;
  max: number;
};

export const PARCEIRO_BANNER_SLIDES: ParceiroBannerSlide[] = [
  {
    id: "quero-delivery",
    kind: "image",
    imageKey: "quero-delivery",
    alt: "Integração NorFood e Quero Delivery — mais pedidos, mais clientes, mais lucro",
    href: "/parceiro/marketing",
  },
  {
    id: "academia",
    kind: "content",
    title: "NorFood Academia",
    subtitle: "Aprenda a vender e implantar restaurantes em poucos dias.",
    cta: "Iniciar estudos",
    href: "/parceiro/academia",
    accent: "from-[#FF9100] to-[#FF5C00]",
  },
  {
    id: "conquistas",
    kind: "content",
    title: "Suba de nível",
    subtitle: "Desbloqueie badges e destaque sua revenda na rede NorFood.",
    cta: "Ver conquistas",
    href: "/parceiro/conquistas",
    accent: "from-[#111111] to-[#374151]",
  },
  {
    id: "novo",
    kind: "content",
    title: "Novo restaurante na carteira",
    subtitle: "Cadastre um cliente ou gere um token de ativação em minutos.",
    cta: "Cadastrar agora",
    href: "/parceiro/restaurantes/nova",
    accent: "from-emerald-600 to-emerald-800",
  },
];

export const PARCEIRO_TIMELINE_POSTS: ParceiroTimelinePost[] = [
  {
    id: "1",
    date: "2026-06-23",
    title: "Pacote de atualizações — Junho",
    excerpt: "Painel parceiro redesenhado, tokens de ativação e impersonate seguro para suporte.",
    type: "release",
  },
  {
    id: "2",
    date: "2026-06-10",
    title: "WhatsApp Meta no NorFood",
    excerpt: "Ative o atendimento Cloud API para seus clientes direto no painel.",
    type: "tip",
  },
  {
    id: "3",
    date: "2026-05-28",
    title: "Trilha: Dominando o NorFood",
    excerpt: "Novo módulo na Academia cobrindo KDS, delivery e fiscal NFC-e.",
    type: "academy",
  },
];

export const DEFAULT_SERVICE_CITIES = [
  "Configure suas cidades em Configurações",
];

const MONTH_LABELS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export function buildMonthlyActivations(tenants: ResellerTenantRow[], months = 12) {
  const now = new Date();
  const buckets: { key: string; label: string; count: number }[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.push({
      key,
      label: `${MONTH_LABELS[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`,
      count: 0,
    });
  }

  for (const tenant of tenants) {
    const created = new Date(tenant.created_at);
    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.find((b) => b.key === key);
    if (bucket) bucket.count += 1;
  }

  const max = Math.max(1, ...buckets.map((b) => b.count));
  return buckets.map((b) => ({ ...b, pct: Math.round((b.count / max) * 100) }));
}

export function getQuarterlyBonus(activeTenants: number) {
  const target = 3;
  const remaining = Math.max(0, target - activeTenants);
  return {
    target,
    remaining,
    discountPct: 2,
    message:
      remaining > 0
        ? `Ative mais ${remaining} cliente${remaining > 1 ? "s" : ""} e ganhe 2% de desconto na fatura trimestral.`
        : "Meta trimestral atingida! Desconto de 2% aplicado na próxima fatura.",
    achieved: remaining === 0,
  };
}

export function buildProfileDimensions(input: {
  teamSize: number;
  totalTenants: number;
  activeTenants: number;
  tokensCreated: number;
  tokensUsed: number;
  achievements: ParceiroAchievement[];
}): ParceiroProfileDimension[] {
  const activationRate =
    input.totalTenants > 0 ? Math.round((input.activeTenants / input.totalTenants) * 100) : 0;
  const achievementRate =
    input.achievements.length > 0
      ? Math.round(
          (input.achievements.filter((a) => a.unlocked).length / input.achievements.length) * 100,
        )
      : 0;
  const tokenAdoption = input.tokensCreated > 0 ? Math.min(100, Math.round((input.tokensUsed / input.tokensCreated) * 100)) : 0;

  const toDots = (pct: number) => Math.min(4, Math.max(0, Math.round((pct / 100) * 4)));

  return [
    { id: "team", label: "Time", score: toDots(Math.min(100, input.teamSize * 25)), max: 4 },
    { id: "spec", label: "Especialização", score: toDots(achievementRate), max: 4 },
    { id: "leads", label: "Geração de leads", score: toDots(Math.min(100, input.tokensCreated * 20)), max: 4 },
    { id: "ticket", label: "Ticket médio", score: toDots(activationRate), max: 4 },
    { id: "focus", label: "Foco", score: toDots(tokenAdoption), max: 4 },
  ];
}

export function parseServiceCitiesFromNotes(notes: string | null | undefined): string[] {
  if (!notes?.trim()) return DEFAULT_SERVICE_CITIES;
  const lines = notes
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines.slice(0, 12) : DEFAULT_SERVICE_CITIES;
}

export function getTierLabel(level: string) {
  return level;
}

export function getTierStyles(level: string) {
  switch (level.toLowerCase()) {
    case "gold":
      return { ring: "ring-yellow-400/40", bg: "bg-gradient-to-br from-yellow-50 to-amber-100", icon: "text-yellow-600" };
    case "silver":
      return { ring: "ring-slate-300/50", bg: "bg-gradient-to-br from-slate-50 to-slate-100", icon: "text-slate-600" };
    case "platinum":
      return { ring: "ring-violet-300/50", bg: "bg-gradient-to-br from-violet-50 to-purple-100", icon: "text-violet-600" };
    default:
      return { ring: "ring-amber-400/40", bg: "bg-gradient-to-br from-amber-50 to-orange-100", icon: "text-amber-700" };
  }
}
