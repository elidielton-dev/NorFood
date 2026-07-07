import type { BillingModel, BillingPlanId } from "@/lib/platform/billing-plans";
import type { DocumentType } from "@/lib/shared/document-validation";
import { buildAppUrl } from "@/lib/shared/app-url";

export type SignupDraft = {
  version: 1;
  savedAt: string;
  step: number;
  billingModel: BillingModel;
  plan: BillingPlanId;
  restaurantName: string;
  slug: string;
  documentType: DocumentType;
  documentNumber: string;
  legalName: string;
  cep: string;
  street: string;
  streetNumber: string;
  neighborhood: string;
  city: string;
  state: string;
  nome: string;
  email: string;
  senha: string;
  ownerPhone: string;
  acceptedTerms: boolean;
};

const STORAGE_KEY = "norfood-signup-draft";
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

export function saveSignupDraft(draft: SignupDraft): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage indisponível ou cheio
  }
}

export function loadSignupDraft(): SignupDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignupDraft;
    if (parsed.version !== 1) return null;
    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (Number.isNaN(age) || age > MAX_AGE_MS) {
      clearSignupDraft();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSignupDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function signupResumeUrl(): string {
  const next = encodeURIComponent("/cadastro?resume=1");
  return buildAppUrl(`/auth/callback?next=${next}`);
}
