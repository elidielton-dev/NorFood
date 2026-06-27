import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SERVICE_CITY_CONFIG } from "@/lib/city-config";
import type { Enums, Tables } from "@/integrations/supabase/types";

type MercadoPagoPreferenceItem = {
  id: string;
  title: string;
  quantity: number;
  unit_price: number;
  currency_id: "BRL";
};

type CreateMercadoPagoCheckoutInput = {
  customer: {
    id: string;
    name: string;
    email: string;
  };
  order: {
    id: string;
    numero: number;
    total: number;
    taxaEntrega: number;
  };
  items: MercadoPagoPreferenceItem[];
  preferredPaymentMethod?: "credito" | "debito" | null;
};

type MercadoPagoPreferenceResponse = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
};

type MercadoPagoPaymentResponse = {
  id: number | string;
  status?: string | null;
  status_detail?: string | null;
  external_reference?: string | null;
  transaction_amount?: number | null;
  payment_type_id?: string | null;
  date_approved?: string | null;
  date_of_expiration?: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string | null;
      qr_code_base64?: string | null;
      ticket_url?: string | null;
    } | null;
  } | null;
};

type PedidoRow = Tables<"pedidos">;
type FormaPagamento = Enums<"forma_pagamento">;

const ONLINE_PAYMENT_METHODS = new Set(["pix", "credito", "debito"]);
export const PIX_PAYMENT_WINDOW_MINUTES = 10;

export function isMercadoPagoMethod(value: string) {
  return ONLINE_PAYMENT_METHODS.has(value);
}

export function getMercadoPagoAccessToken() {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Mercado Pago nao configurado. Defina MP_ACCESS_TOKEN para habilitar pagamentos online.",
    );
  }
  return token;
}

function getApplicationBaseUrl() {
  const configuredBaseUrl =
    process.env.PUBLIC_APP_URL?.trim() || process.env.MP_APP_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  const request = getRequest();
  if (!request) {
    throw new Error("Nao foi possivel determinar a URL base da aplicacao para o Mercado Pago.");
  }

  return new URL(request.url).origin.replace(/\/+$/, "");
}

export function buildMercadoPagoWebhookUrl() {
  return (
    process.env.MP_WEBHOOK_URL?.trim() || `${getApplicationBaseUrl()}/api/mercado-pago/webhook`
  );
}

function buildWebhookUrl() {
  return buildMercadoPagoWebhookUrl();
}

function buildReturnUrl(orderNumber: number) {
  return `${getApplicationBaseUrl()}/?pedido=${orderNumber}`;
}

export async function mercadoPagoRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getMercadoPagoAccessToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mercado Pago respondeu ${response.status}: ${errorText || "sem detalhes"}`);
  }

  return (await response.json()) as T;
}

export async function createMercadoPagoCheckout(input: CreateMercadoPagoCheckoutInput) {
  const webhookUrl = buildWebhookUrl();
  const returnUrl = buildReturnUrl(input.order.numero);
  const statementDescriptor =
    (process.env.MP_STATEMENT_DESCRIPTOR ?? "ABELHA E MEL")
      .replace(/[^A-Za-z0-9 ]/g, "")
      .slice(0, 13)
      .trim() || "ABELHA E MEL";

  const payload = {
    external_reference: input.order.id,
    notification_url: webhookUrl,
    statement_descriptor: statementDescriptor,
    auto_return: "approved",
    back_urls: {
      success: returnUrl,
      pending: returnUrl,
      failure: returnUrl,
    },
    payer: {
      name: input.customer.name,
      email: input.customer.email,
    },
    items: input.items,
    payment_methods:
      input.preferredPaymentMethod === "credito"
        ? {
            excluded_payment_types: [
              { id: "debit_card" },
              { id: "ticket" },
              { id: "atm" },
              { id: "bank_transfer" },
            ],
          }
        : input.preferredPaymentMethod === "debito"
          ? {
              excluded_payment_types: [
                { id: "credit_card" },
                { id: "ticket" },
                { id: "atm" },
                { id: "bank_transfer" },
              ],
            }
          : undefined,
    metadata: {
      pedido_id: input.order.id,
      pedido_numero: input.order.numero,
      cliente_id: input.customer.id,
      cidade: SERVICE_CITY_CONFIG.city,
      estado: SERVICE_CITY_CONFIG.state,
    },
  };

  const preference = await mercadoPagoRequest<MercadoPagoPreferenceResponse>(
    "/checkout/preferences",
    {
      method: "POST",
      headers: {
        "X-Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify(payload),
    },
  );

  const checkoutUrl =
    (process.env.MP_ENVIRONMENT ?? "sandbox") === "production"
      ? preference.init_point
      : preference.sandbox_init_point || preference.init_point;

  if (!checkoutUrl) {
    throw new Error("Mercado Pago nao retornou uma URL de checkout.");
  }

  return {
    preferenceId: preference.id,
    checkoutUrl,
  };
}

export async function fetchMercadoPagoPayment(paymentId: string) {
  return await mercadoPagoRequest<MercadoPagoPaymentResponse>(`/v1/payments/${paymentId}`, {
    method: "GET",
  });
}

export async function createMercadoPagoPixPayment(input: {
  customer: {
    id: string;
    name: string;
    email: string;
  };
  order: {
    id: string;
    numero: number;
    total: number;
  };
  description: string;
}) {
  const payment = await mercadoPagoRequest<MercadoPagoPaymentResponse>("/v1/payments", {
    method: "POST",
    headers: {
      "X-Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({
      transaction_amount: Number(input.order.total.toFixed(2)),
      description: input.description,
      payment_method_id: "pix",
      external_reference: input.order.id,
      notification_url: buildWebhookUrl(),
      payer: {
        email: input.customer.email,
        first_name: input.customer.name,
      },
    }),
  });

  const transactionData = payment.point_of_interaction?.transaction_data;
  if (!transactionData?.qr_code || !transactionData.qr_code_base64) {
    throw new Error("Mercado Pago nao retornou os dados do QR Code Pix.");
  }

  return {
    paymentId: String(payment.id),
    paymentStatus: payment.status ?? "pending",
    qrCode: transactionData.qr_code,
    qrCodeBase64: transactionData.qr_code_base64,
    ticketUrl: transactionData.ticket_url ?? null,
    providerExpiresAt: payment.date_of_expiration ?? null,
    expiresAt: new Date(Date.now() + PIX_PAYMENT_WINDOW_MINUTES * 60_000).toISOString(),
  };
}

export async function ensureOperationalOrderRecords(
  order: Pick<
    PedidoRow,
    "id" | "numero" | "endereco" | "taxa_entrega" | "total" | "forma_pagamento"
  > & {
    bairro: string;
    createFinanceEntry?: boolean;
  },
) {
  const { data: existingDelivery, error: deliverySelectError } = await supabaseAdmin
    .from("entregas")
    .select("id")
    .eq("pedido_id", order.id)
    .maybeSingle();
  if (deliverySelectError) throw deliverySelectError;

  if (!existingDelivery) {
    const { error: deliveryInsertError } = await supabaseAdmin.from("entregas").insert({
      pedido_id: order.id,
      endereco: order.endereco ?? "Endereco nao informado",
      bairro: order.bairro,
      taxa: order.taxa_entrega,
      status: "pendente",
    });
    if (deliveryInsertError) throw deliveryInsertError;
  }

  if (!order.createFinanceEntry) {
    return;
  }

  const { data: existingFinanceEntry, error: financeSelectError } = await supabaseAdmin
    .from("lancamentos_financeiros")
    .select("id")
    .eq("pedido_id", order.id)
    .limit(1)
    .maybeSingle();
  if (financeSelectError) throw financeSelectError;

  if (!existingFinanceEntry) {
    const { error: financeInsertError } = await supabaseAdmin
      .from("lancamentos_financeiros")
      .insert({
        tipo: "entrada",
        descricao: `Pedido #${order.numero}`,
        categoria: "Vendas delivery",
        valor: order.total,
        forma: order.forma_pagamento as FormaPagamento,
        pedido_id: order.id,
      });
    if (financeInsertError) throw financeInsertError;
  }
}

function mapPaymentStatusToOrderStatus(
  paymentStatus: string | null | undefined,
): PedidoRow["status"] {
  if (paymentStatus === "approved") return "aberto";
  if (
    paymentStatus === "cancelled" ||
    paymentStatus === "rejected" ||
    paymentStatus === "refunded" ||
    paymentStatus === "charged_back"
  ) {
    return "cancelado";
  }
  return "aberto";
}

export async function syncMercadoPagoPayment(paymentId: string) {
  const payment = await fetchMercadoPagoPayment(paymentId);
  const orderReference = payment.external_reference?.trim();

  if (!orderReference) {
    throw new Error(`Pagamento ${paymentId} sem external_reference.`);
  }

  if (orderReference.startsWith("norfood-billing:")) {
    const { syncPlatformBillingMercadoPagoPayment } =
      await import("@/lib/api/platform-billing-mercadopago.server");
    return syncPlatformBillingMercadoPagoPayment(payment);
  }

  if (orderReference.startsWith("norfood-signup:")) {
    const { syncSignupVerificationPayment } =
      await import("@/lib/api/platform-billing-signup.server");
    return syncSignupVerificationPayment(payment);
  }

  return syncMercadoPagoPaymentToOrder(paymentId);
}

export async function syncMercadoPagoPaymentToOrder(paymentId: string) {
  const payment = await fetchMercadoPagoPayment(paymentId);
  const orderReference = payment.external_reference?.trim();

  if (!orderReference) {
    throw new Error(`Pagamento ${paymentId} sem external_reference.`);
  }

  const { data: pedido, error: orderSelectError } = await supabaseAdmin
    .from("pedidos")
    .select("*")
    .eq("id", orderReference)
    .single();
  if (orderSelectError) throw orderSelectError;

  const nextOrderStatus = mapPaymentStatusToOrderStatus(payment.status);
  const updatePayload = {
    status: nextOrderStatus,
    observacoes: appendMercadoPagoMetadata(pedido.observacoes, {
      provider: "mercado_pago",
      status: payment.status ?? "unknown",
      reference: getMercadoPagoMetadataValue(pedido.observacoes, "mp_reference") ?? orderReference,
      paymentId: String(payment.id),
      providerExpiresAt: payment.date_of_expiration ?? undefined,
      ticketUrl: payment.point_of_interaction?.transaction_data?.ticket_url ?? undefined,
    }),
    updated_at: new Date().toISOString(),
  };

  const { data: updatedOrder, error: orderUpdateError } = await supabaseAdmin
    .from("pedidos")
    .update(updatePayload)
    .eq("id", pedido.id)
    .select("*")
    .single();
  if (orderUpdateError) throw orderUpdateError;

  if (payment.status === "approved") {
    const bairro = extractNeighborhoodFromOrder(updatedOrder);
    await ensureOperationalOrderRecords({
      id: updatedOrder.id,
      numero: updatedOrder.numero,
      endereco: updatedOrder.endereco,
      taxa_entrega: updatedOrder.taxa_entrega,
      total: updatedOrder.total,
      forma_pagamento: updatedOrder.forma_pagamento,
      bairro,
      createFinanceEntry: true,
    });
  }

  return {
    orderId: updatedOrder.id,
    paymentId: String(payment.id),
    paymentStatus: payment.status ?? "unknown",
    orderStatus: updatedOrder.status,
  };
}

function getOrderPixExpirationIso(order: Pick<PedidoRow, "created_at" | "observacoes">) {
  return (
    getMercadoPagoMetadataValue(order.observacoes, "mp_expires_at") ??
    new Date(
      new Date(order.created_at).getTime() + PIX_PAYMENT_WINDOW_MINUTES * 60_000,
    ).toISOString()
  );
}

export async function expireStalePendingMercadoPagoOrders(input?: {
  customerId?: string;
  orderId?: string;
}) {
  let query = supabaseAdmin
    .from("pedidos")
    .select("id, created_at, observacoes, status, cliente_id")
    .ilike("observacoes", "%mp_status=pending%")
    .neq("status", "cancelado")
    .order("created_at", { ascending: false })
    .limit(100);

  if (input?.customerId) {
    query = query.eq("cliente_id", input.customerId);
  }

  if (input?.orderId) {
    query = query.eq("id", input.orderId);
  }

  const { data: orders, error } = await query;
  if (error) throw error;

  const now = Date.now();
  const expiredOrderIds: string[] = [];

  for (const order of orders ?? []) {
    const expirationIso = getOrderPixExpirationIso(order);
    const expirationTime = new Date(expirationIso).getTime();
    if (!Number.isFinite(expirationTime) || expirationTime > now) continue;

    const paymentId = getMercadoPagoMetadataValue(order.observacoes, "mp_payment_id");
    if (paymentId) {
      try {
        const payment = await fetchMercadoPagoPayment(paymentId);
        if (payment.status === "approved") {
          await syncMercadoPagoPaymentToOrder(paymentId);
          continue;
        }
      } catch {
        // If the provider lookup fails, we still enforce the local expiration window below.
      }
    }

    expiredOrderIds.push(order.id);
  }

  if (!expiredOrderIds.length) {
    return { expiredOrderIds: [] };
  }

  for (const orderId of expiredOrderIds) {
    const { data: currentOrder, error: orderSelectError } = await supabaseAdmin
      .from("pedidos")
      .select("id, observacoes")
      .eq("id", orderId)
      .single();
    if (orderSelectError) throw orderSelectError;

    const { error: updateError } = await supabaseAdmin
      .from("pedidos")
      .update({
        status: "cancelado",
        observacoes: appendMercadoPagoMetadata(currentOrder.observacoes, {
          status: "cancelled",
        }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (updateError) throw updateError;
  }

  return { expiredOrderIds };
}

function extractNeighborhoodFromOrder(order: Pick<PedidoRow, "observacoes">) {
  const observacoes = order.observacoes ?? "";
  const match = observacoes.match(/bairro=([^;]+)/i);
  return match?.[1]?.trim() || "Centro";
}

export function validateMercadoPagoWebhook(request: Request, body: unknown) {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  const dataId =
    typeof body === "object" &&
    body !== null &&
    "data" in body &&
    typeof (body as { data?: { id?: string | number } }).data?.id !== "undefined"
      ? String((body as { data: { id: string | number } }).data.id)
      : "";

  if (!signatureHeader || !requestId || !dataId) {
    return false;
  }

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((chunk) => {
      const [key, value] = chunk.split("=");
      return [key?.trim(), value?.trim()];
    }),
  );

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const digest = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(v1));
  } catch {
    return false;
  }
}

export function getWebhookEventType(body: unknown, request: Request) {
  if (
    typeof body === "object" &&
    body !== null &&
    "type" in body &&
    typeof (body as { type?: unknown }).type === "string"
  ) {
    return (body as { type: string }).type;
  }

  const url = new URL(request.url);
  return url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
}

export function getWebhookPaymentId(body: unknown, request: Request) {
  if (
    typeof body === "object" &&
    body !== null &&
    "data" in body &&
    typeof (body as { data?: { id?: string | number } }).data?.id !== "undefined"
  ) {
    return String((body as { data: { id: string | number } }).data.id);
  }

  const url = new URL(request.url);
  return url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "";
}

export function getWebhookAuthorizationSummary() {
  const request = getRequest();
  const accessToken = process.env.MP_ACCESS_TOKEN?.trim();
  const webhookSecret = process.env.MP_WEBHOOK_SECRET?.trim();
  const publicKey =
    process.env.VITE_MP_PUBLIC_KEY?.trim() || process.env.MP_PUBLIC_KEY?.trim();
  return {
    hasAccessToken: Boolean(accessToken),
    hasWebhookSecret: Boolean(webhookSecret),
    hasPublicKey: Boolean(publicKey),
    webhookUrl: buildMercadoPagoWebhookUrl(),
    requestHost: request?.headers.get("host") ?? "",
  };
}

export function getMercadoPagoMetadataValue(observacoes: string | null | undefined, key: string) {
  if (!observacoes) return null;
  const regex = new RegExp(`${key}=([^;]+)`, "i");
  return observacoes.match(regex)?.[1]?.trim() ?? null;
}

export function appendMercadoPagoMetadata(
  observacoes: string | null | undefined,
  metadata: {
    provider?: string;
    status?: string;
    reference?: string;
    paymentId?: string;
    checkoutUrl?: string;
    pixQrCode?: string;
    pixQrCodeBase64?: string;
    expiresAt?: string;
    providerExpiresAt?: string;
    ticketUrl?: string;
  },
) {
  const baseEntries = (observacoes ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(
      (item) =>
        !/^mp_(provider|status|reference|payment_id|checkout_url|pix_qr_code|pix_qr_code_base64|expires_at|provider_expires_at|ticket_url)=/i.test(
          item,
        ),
    );

  if (metadata.provider) baseEntries.push(`mp_provider=${metadata.provider}`);
  if (metadata.status) baseEntries.push(`mp_status=${metadata.status}`);
  if (metadata.reference) baseEntries.push(`mp_reference=${metadata.reference}`);
  if (metadata.paymentId) baseEntries.push(`mp_payment_id=${metadata.paymentId}`);
  if (metadata.checkoutUrl) baseEntries.push(`mp_checkout_url=${metadata.checkoutUrl}`);
  if (metadata.pixQrCode) baseEntries.push(`mp_pix_qr_code=${metadata.pixQrCode}`);
  if (metadata.pixQrCodeBase64)
    baseEntries.push(`mp_pix_qr_code_base64=${metadata.pixQrCodeBase64}`);
  if (metadata.expiresAt) baseEntries.push(`mp_expires_at=${metadata.expiresAt}`);
  if (metadata.providerExpiresAt)
    baseEntries.push(`mp_provider_expires_at=${metadata.providerExpiresAt}`);
  if (metadata.ticketUrl) baseEntries.push(`mp_ticket_url=${metadata.ticketUrl}`);

  return baseEntries.join("; ");
}

type MercadoPagoSearchResponse = {
  paging?: { total?: number };
  results?: MercadoPagoPaymentResponse[];
};

export async function mercadoPagoGetBalance() {
  const data = await mercadoPagoRequest<{
    available_balance?: number;
    total_amount?: number;
  }>("/v1/account/balance");
  return Number(data.available_balance ?? data.total_amount ?? 0);
}

export async function mercadoPagoSearchPayments(input: { limit?: number; days?: number }) {
  const limit = input.limit ?? 20;
  const days = input.days ?? 30;
  const begin = new Date();
  begin.setDate(begin.getDate() - days);
  const beginDate = begin.toISOString();

  const query = new URLSearchParams({
    sort: "date_created",
    criteria: "desc",
    limit: String(limit),
    range: "date_created",
    begin_date: beginDate,
  });

  const data = await mercadoPagoRequest<MercadoPagoSearchResponse>(
    `/v1/payments/search?${query.toString()}`,
  );

  const results = data.results ?? [];
  const approved = results.filter((payment) => payment.status === "approved");
  const pending = results.filter(
    (payment) => payment.status === "pending" || payment.status === "in_process",
  );
  const totalReceived = approved.reduce(
    (sum, payment) => sum + Number(payment.transaction_amount ?? 0),
    0,
  );

  return {
    totalReceived,
    approvedCount: approved.length,
    pendingCount: pending.length,
    payments: results.map((payment) => ({
      id: String(payment.id),
      status: payment.status ?? "unknown",
      statusDetail: payment.status_detail ?? null,
      amount: Number(payment.transaction_amount ?? 0),
      paymentType: payment.payment_type_id ?? null,
      createdAt: (payment as { date_created?: string }).date_created ?? null,
      approvedAt: payment.date_approved ?? null,
      externalReference: payment.external_reference ?? null,
    })),
  };
}
