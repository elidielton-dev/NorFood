export type ProfileRow = {
  id: string;
  nome: string;
  telefone: string | null;
  avatar_url?: string | null;
};

export type RiderProfileRow = {
  user_id: string;
  avatar_url?: string | null;
  score?: number | null;
  completed_count?: number | null;
  success_rate?: number | null;
  greeting?: string | null;
  vehicle?: string | null;
  plate?: string | null;
  cep?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  emergency_phone?: string | null;
  pix_key?: string | null;
  support_phone?: string | null;
  cnh?: string | null;
  cnh_expiry?: string | null;
  vehicle_document?: string | null;
  notify_new_orders?: boolean | null;
  notify_occurrences?: boolean | null;
  auto_online_after_login?: boolean | null;
  online?: boolean | null;
};

export type DeliveryRow = {
  id: string;
  pedido_id: string;
  motoboy_id: string | null;
  tenant_id?: string | null;
  status: string;
  endereco: string;
  bairro: string | null;
  distancia_km: number | null;
  taxa: number;
  created_at: string;
  updated_at: string;
  saiu_em: string | null;
  entregue_em: string | null;
};

export type OrderRow = {
  id: string;
  numero: number;
  cliente_id: string | null;
  status: string;
  endereco: string | null;
  observacoes: string | null;
  previsao_entrega: string | null;
  distancia_restante: number | null;
  latitude_cliente: number | null;
  longitude_cliente: number | null;
  ordem_na_rota: number | null;
  created_at: string;
};

export type RouteRow = {
  pedido_id: string;
  ordem_entrega: number;
  tempo_estimado: number | null;
  distancia_km: number | null;
  status: string;
};

export type ItemRow = {
  pedido_id: string;
  quantidade: number;
  produtos?: { nome?: string | null } | null;
};

export type IncidentRow = {
  id: string;
  delivery_id: string;
  rider_id: string;
  type: string;
  note: string | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  delivery_id: string;
  rider_id: string;
  template_id: string | null;
  text: string;
  customer_phone: string;
  customer_whatsapp: string;
  quick_whatsapp: string;
  quick_sms: string;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  rider_id: string;
  title: string;
  body: string;
  type: string;
  delivery_id: string | null;
  created_at: string;
  read_at: string | null;
};
