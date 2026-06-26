/** Marca NorFood — cores e assets centralizados */
export const NORFOOD_BRAND_NAME = "NorFood";
export const NORFOOD_TAGLINE = "Sistema de Delivery";

export const NORFOOD_COLORS = {
  orange: "#FF9100",
  orangeDark: "#FF5C00",
  ink: "#1A1A1A",
  muted: "#6B7280",
  background: "#F6F7F9",
} as const;

/** URL pública — PNG com fundo transparente */
export const NORFOOD_LOGO_URL = "/logo-norfood.png";

/** Import estático para bundler (componentes React) */
export { default as norfoodLogoSrc } from "@/assets/logo-norfood.png";
