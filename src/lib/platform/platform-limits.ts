/**
 * Limites da plataforma por perfil de hospedagem.
 * VPS 8 GB (app only, Supabase externo): até ~35 tenants confortável.
 */

export type PlatformCapacityProfile = "vps-8gb" | "vps-4gb" | "custom";

const PROFILE_DEFAULTS: Record<
  Exclude<PlatformCapacityProfile, "custom">,
  { maxTenants: number; pm2Instances: number; label: string }
> = {
  "vps-8gb": {
    maxTenants: 35,
    pm2Instances: 3,
    label: "VPS 8 GB — app + Caddy (Supabase na nuvem)",
  },
  "vps-4gb": {
    maxTenants: 18,
    pm2Instances: 2,
    label: "VPS 4 GB — app + Caddy (Supabase na nuvem)",
  },
};

function readProfile(): PlatformCapacityProfile {
  const raw = (process.env.NORFOOD_CAPACITY_PROFILE ?? "vps-8gb").trim().toLowerCase();
  if (raw === "vps-4gb" || raw === "vps-8gb" || raw === "custom") return raw;
  return "vps-8gb";
}

function readIntEnv(key: string, fallback: number) {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getPlatformCapacityConfig() {
  const profile = readProfile();
  const defaults =
    profile === "custom"
      ? { maxTenants: 35, pm2Instances: 3, label: "Perfil customizado" }
      : PROFILE_DEFAULTS[profile];

  return {
    profile,
    label: defaults.label,
    maxTenants: readIntEnv("NORFOOD_MAX_TENANTS", defaults.maxTenants),
    pm2Instances: readIntEnv("NORFOOD_PM2_INSTANCES", defaults.pm2Instances),
    /** Com Evolution/WhatsApp na mesma VPS, reduza tenants (~15 no 8 GB). */
    evolutionOnSameHost: process.env.NORFOOD_EVOLUTION_ON_VPS === "true",
    evolutionMaxTenants: readIntEnv("NORFOOD_MAX_TENANTS_WITH_EVOLUTION", 15),
  };
}

export function getEffectiveMaxTenants() {
  const cfg = getPlatformCapacityConfig();
  if (cfg.evolutionOnSameHost) {
    return Math.min(cfg.maxTenants, cfg.evolutionMaxTenants);
  }
  return cfg.maxTenants;
}

export function assertCanCreateTenant(currentCount: number) {
  const max = getEffectiveMaxTenants();
  if (currentCount >= max) {
    throw new Error(
      `Limite de empresas atingido (${currentCount}/${max}). Aumente NORFOOD_MAX_TENANTS ou faça upgrade da VPS.`,
    );
  }
}
