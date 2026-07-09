const DEFAULT_API_URL = "https://api.quero.io";

export type QueroDeliveryCredentials = {
  apiUrl?: string;
  placeId: string;
  apiToken: string;
};

export type QueroOrderEvent = {
  id: string;
  status?: string;
  eventType?: string;
  orderNumber?: string | number;
  customer?: { name?: string; phone?: string };
  delivery?: { address?: string; neighborhood?: string };
  payment?: { type?: string; total?: number };
  items?: Array<{
    name?: string;
    quantity?: number;
    unitPrice?: number;
    internalCode?: string;
    productId?: string;
  }>;
};

function buildHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Quero Delivery HTTP ${response.status}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export class QueroDeliveryClient {
  private readonly baseUrl: string;
  private readonly placeId: string;
  private readonly token: string;

  constructor(credentials: QueroDeliveryCredentials) {
    this.baseUrl = (credentials.apiUrl ?? process.env.QUERO_DELIVERY_API_URL ?? DEFAULT_API_URL).replace(
      /\/$/,
      "",
    );
    this.placeId = credentials.placeId;
    this.token = credentials.apiToken;
  }

  async pollOrderEvents(cursor?: string | null) {
    const params = new URLSearchParams({ placeId: this.placeId });
    if (cursor) params.set("lastEventId", cursor);
    const response = await fetch(`${this.baseUrl}/orders/events:polling?${params}`, {
      headers: buildHeaders(this.token),
    });
    return parseJson<{ events?: QueroOrderEvent[]; lastEventId?: string }>(response);
  }

  async listOrders(eventType = "CREATED") {
    const params = new URLSearchParams({ placeId: this.placeId, eventType });
    const response = await fetch(`${this.baseUrl}/orders?${params}`, {
      headers: buildHeaders(this.token),
    });
    return parseJson<{ orders?: QueroOrderEvent[] } | QueroOrderEvent[]>(response);
  }

  async getOrder(orderId: string) {
    const response = await fetch(`${this.baseUrl}/orders/${orderId}?placeId=${this.placeId}`, {
      headers: buildHeaders(this.token),
    });
    return parseJson<QueroOrderEvent>(response);
  }

  async acceptOrder(orderId: string) {
    const response = await fetch(`${this.baseUrl}/orders/${orderId}/accept`, {
      method: "POST",
      headers: buildHeaders(this.token),
      body: JSON.stringify({ placeId: this.placeId }),
    });
    return parseJson(response);
  }

  async dispatchOrder(orderId: string) {
    const response = await fetch(`${this.baseUrl}/orders/${orderId}/dispatch`, {
      method: "POST",
      headers: buildHeaders(this.token),
      body: JSON.stringify({ placeId: this.placeId }),
    });
    return parseJson(response);
  }

  async concludeOrder(orderId: string) {
    const response = await fetch(`${this.baseUrl}/orders/${orderId}/deliveryCompleted`, {
      method: "POST",
      headers: buildHeaders(this.token),
      body: JSON.stringify({ placeId: this.placeId }),
    });
    return parseJson(response);
  }

  async listProducts(limit = 100, offset = 0) {
    const params = new URLSearchParams({
      placeId: this.placeId,
      limit: String(limit),
      offset: String(offset),
    });
    const response = await fetch(`${this.baseUrl}/products?${params}`, {
      headers: buildHeaders(this.token),
    });
    return parseJson<{ products?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(
      response,
    );
  }
}
