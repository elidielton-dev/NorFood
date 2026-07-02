import type { LucideIcon } from "lucide-react";
import { Banknote, CreditCard, Smartphone } from "lucide-react";

export type PaymentMethodId =
  | "dinheiro"
  | "pix_entrega"
  | "pix_online"
  | "credito"
  | "debito";

export type PaymentMethodDef = {
  id: PaymentMethodId;
  label: string;
  group: "presencial" | "online";
  icon: LucideIcon;
  requiresMercadoPago?: boolean;
};

export const PAYMENT_METHOD_DEFS: PaymentMethodDef[] = [
  { id: "dinheiro", label: "Dinheiro na entrega / balcão", group: "presencial", icon: Banknote },
  { id: "pix_entrega", label: "Pix na entrega", group: "presencial", icon: Smartphone },
  {
    id: "pix_online",
    label: "Pix online (Mercado Pago)",
    group: "online",
    icon: Smartphone,
    requiresMercadoPago: true,
  },
  {
    id: "credito",
    label: "Cartão de crédito (Mercado Pago)",
    group: "online",
    icon: CreditCard,
    requiresMercadoPago: true,
  },
  {
    id: "debito",
    label: "Cartão de débito (Mercado Pago)",
    group: "online",
    icon: CreditCard,
    requiresMercadoPago: true,
  },
];

export const DEFAULT_PAYMENT_METHODS: PaymentMethodId[] = [
  "dinheiro",
  "pix_entrega",
  "pix_online",
  "credito",
  "debito",
];

export function normalizePaymentMethods(raw: unknown): PaymentMethodId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PAYMENT_METHODS];
  const allowed = new Set(PAYMENT_METHOD_DEFS.map((m) => m.id));
  const ids = raw.filter((id): id is PaymentMethodId => typeof id === "string" && allowed.has(id as PaymentMethodId));
  return ids.length ? ids : [...DEFAULT_PAYMENT_METHODS];
}

export function isPaymentMethodEnabled(methods: PaymentMethodId[], id: PaymentMethodId) {
  return methods.includes(id);
}
