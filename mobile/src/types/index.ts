export type TenantSummary = {
  id: string;
  role: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
};

export type TenantSettings = {
  phone: string | null;
  address: string | null;
  description: string | null;
  deliveryFeeDefault: number;
  deliveryTimeMinutes: number;
  pedidoMinimo: number;
  lojaAberta: boolean;
};

export type DeliveryTab = "disponiveis" | "andamento" | "historico";
export type DeliveryStatus = "available" | "in_progress" | "completed";
export type DeliveryStep = "confirmed" | "preparing" | "on_route" | "arrived" | "delivered";
export type DeliveryRouteStage =
  | "assigned"
  | "arrived_store"
  | "picked_up"
  | "arrived_customer"
  | "delivered";
export type IncidentType =
  | "Cliente nao atende"
  | "Endereco incorreto"
  | "Pedido danificado"
  | "Transito"
  | "Chuva"
  | "Outro";

export type TimelineItem = {
  step: DeliveryStep;
  title: string;
  description: string;
  time: string;
};

export type DeliveryOrder = {
  id: string;
  number: string;
  customer: string;
  phone: string;
  whatsapp: string;
  address: string;
  neighborhood: string;
  city: string;
  reference: string;
  distanceKm: number;
  fee: number;
  eta: string;
  etaMinutes: number;
  items: string[];
  totalItems: number;
  status: DeliveryStatus;
  badgeLabel: string;
  currentStep: DeliveryStep;
  routeStage?: DeliveryRouteStage;
  timeline: TimelineItem[];
  orderInRoute?: number;
  deliveriesAhead?: number;
  customerLatitude?: number;
  customerLongitude?: number;
};

export type RiderProfile = {
  id: string;
  name: string;
  shortName: string;
  phone: string;
  avatar: string;
  score: number;
  vehicle: string;
  plate: string;
  online: boolean;
  completedCount: number;
  successRate: number;
  greeting: string;
  email: string;
  cep: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  emergencyPhone: string;
  pixKey: string;
  supportPhone: string;
  documents: {
    cnh: string;
    cnhExpiry: string;
    vehicleDocument: string;
  };
  settings: {
    darkModeReady: boolean;
    notifyNewOrders: boolean;
    notifyOccurrences: boolean;
    autoOnlineAfterLogin: boolean;
  };
};

export type EarningsSnapshot = {
  today: number;
  week: number;
  month: number;
  fees: number;
  distance: number;
  additions: number;
  bonus: number;
  discounts: number;
  chart: Array<{ label: string; value: number }>;
};

export type DeliveryIncident = {
  id: string;
  deliveryId: string;
  riderId: string;
  type: IncidentType;
  note: string;
  createdAt: string;
};

export type DeliveryMessage = {
  id: string;
  deliveryId: string;
  riderId: string;
  templateId: string | null;
  text: string;
  customerPhone: string;
  customerWhatsapp: string;
  quickLinks: {
    whatsapp: string;
    sms: string;
  };
  createdAt: string;
};

export type AppNotification = {
  id: string;
  riderId: string | null;
  title: string;
  body: string;
  type: "delivery_ready" | "delivery_assigned" | "delivery_progress" | "incident_logged";
  deliveryId: string | null;
  createdAt: string;
  readAt: string | null;
};

export type QuickMessageTemplate = {
  id: string;
  label: string;
  text: string;
};

export type AppState = {
  loggedIn: boolean;
  rememberLogin: boolean;
  activeTenantId: string | null;
  tenant: TenantSummary | null;
  tenantSettings: TenantSettings | null;
  availableTenants: TenantSummary[];
  rider: RiderProfile;
  deliveries: DeliveryOrder[];
  incidents: DeliveryIncident[];
  messages: DeliveryMessage[];
  notifications: AppNotification[];
  earnings: EarningsSnapshot;
};

export type RiderRealtimeLocation = {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  battery: number | null;
  status: "online" | "offline" | "em_rota" | "pausado";
  updatedAt: string;
};
