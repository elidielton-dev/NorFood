/** Token de verificação do webhook Meta (GET challenge). */
export const DEFAULT_WABA_VERIFY_TOKEN = "norfood-waba-2026";

/** Dados padrão para cadastro do app na Meta (Facebook Developer). */
export const META_DEVELOPER_APP = {
  /** E-mail de contato do app — use no campo "App contact email" */
  contactEmail: "meta@norfood.com.br",
  appName: "NorFood",
  appDomain: "norfood.com.br",
  siteUrl: "https://norfood.com.br",
  webhookUrl: "https://norfood.com.br/api/waba/webhook",
  verifyToken: DEFAULT_WABA_VERIFY_TOKEN,
  privacyPolicyUrl: "https://norfood.com.br",
  dataDeletionEmail: "meta@norfood.com.br",
} as const;

export function getMetaDeveloperContactEmail() {
  return (
    process.env.META_APP_CONTACT_EMAIL?.trim() ||
    process.env.VITE_META_APP_CONTACT_EMAIL?.trim() ||
    META_DEVELOPER_APP.contactEmail
  );
}
