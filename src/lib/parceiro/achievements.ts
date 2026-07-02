import type { LucideIcon } from "lucide-react";
import { Building2, Crown, KeyRound, Rocket, Star, Target, Trophy, Users } from "lucide-react";

export type ParceiroAchievement = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tier: "bronze" | "silver" | "gold" | "platinum";
  progress: number;
  target: number;
  unlocked: boolean;
  unlockedAt?: string;
};

export type AchievementInput = {
  totalTenants: number;
  activeTenants: number;
  tokensCreated: number;
  tokensUsed: number;
  maxTenants: number;
  createdAt?: string;
};

export function buildParceiroAchievements(input: AchievementInput): ParceiroAchievement[] {
  const {
    totalTenants,
    activeTenants,
    tokensCreated,
    tokensUsed,
    maxTenants,
  } = input;

  const defs: Omit<ParceiroAchievement, "progress" | "unlocked">[] = [
    {
      id: "first-client",
      title: "Primeiro cliente",
      description: "Cadastrou o primeiro restaurante na carteira.",
      icon: Rocket,
      tier: "bronze",
      target: 1,
    },
    {
      id: "five-clients",
      title: "Carteira em expansão",
      description: "Alcançou 5 restaurantes ativos na rede.",
      icon: Building2,
      tier: "silver",
      target: 5,
    },
    {
      id: "ten-clients",
      title: "Rede consolidada",
      description: "Gerencia 10 ou mais restaurantes.",
      icon: Crown,
      tier: "gold",
      target: 10,
    },
    {
      id: "full-quota",
      title: "Licenças maximizadas",
      description: "Utilizou 100% das licenças contratadas.",
      icon: Trophy,
      tier: "platinum",
      target: maxTenants,
    },
    {
      id: "first-token",
      title: "Token liberado",
      description: "Gerou o primeiro token de ativação.",
      icon: KeyRound,
      tier: "bronze",
      target: 1,
    },
    {
      id: "token-adoption",
      title: "Adoção por token",
      description: "Teve 3 tokens consumidos por novos clientes.",
      icon: Target,
      tier: "silver",
      target: 3,
    },
    {
      id: "active-base",
      title: "Base saudável",
      description: "Mantém 80% dos clientes com status ativo.",
      icon: Users,
      tier: "gold",
      target: 80,
    },
    {
      id: "star-partner",
      title: "Parceiro estrela",
      description: "Combina carteira ativa e uso consistente de tokens.",
      icon: Star,
      tier: "platinum",
      target: 1,
    },
  ];

  return defs.map((def) => {
    let progress = 0;
    if (def.id === "first-client") progress = totalTenants;
    else if (def.id === "five-clients") progress = totalTenants;
    else if (def.id === "ten-clients") progress = totalTenants;
    else if (def.id === "full-quota") progress = totalTenants;
    else if (def.id === "first-token") progress = tokensCreated;
    else if (def.id === "token-adoption") progress = tokensUsed;
    else if (def.id === "active-base") {
      progress = totalTenants > 0 ? Math.round((activeTenants / totalTenants) * 100) : 0;
    } else if (def.id === "star-partner") {
      progress =
        totalTenants >= 3 && tokensUsed >= 1 && activeTenants >= 2 ? 1 : 0;
    }

    const unlocked =
      def.id === "active-base"
        ? progress >= def.target && totalTenants >= 3
        : def.id === "star-partner"
          ? progress >= def.target
          : progress >= def.target;

    return {
      ...def,
      progress: Math.min(progress, def.target),
      unlocked,
    };
  });
}

export function getAchievementTierColor(tier: ParceiroAchievement["tier"]) {
  switch (tier) {
    case "bronze":
      return "border-amber-300 bg-amber-50 text-amber-900";
    case "silver":
      return "border-slate-300 bg-slate-50 text-slate-800";
    case "gold":
      return "border-yellow-400 bg-yellow-50 text-yellow-900";
    case "platinum":
      return "border-violet-300 bg-violet-50 text-violet-900";
  }
}
