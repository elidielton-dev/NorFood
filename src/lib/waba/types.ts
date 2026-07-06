export const WABA_WORKSPACE_ID = "default";

export type WabaConversationStatus = "open" | "pending" | "closed";

export type WabaMessageSender = "customer" | "agent" | "bot";

export type WabaContentType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "location"
  | "template";

export type WabaMessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface WabaContact {
  id: string;
  workspace_id: string;
  phone: string;
  phone_normalized?: string;
  name: string | null;
  email: string | null;
  company: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WabaConversation {
  id: string;
  workspace_id: string;
  contact_id: string;
  status: WabaConversationStatus;
  assigned_agent_id: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
  attendance_opened_at?: string | null;
  contact?: WabaContact | null;
}

export interface AtendimentoMessagesMeta {
  hasOlderBeforeSession: boolean;
  hasMoreInSession: boolean;
  hasMoreInHistory: boolean;
  sessionAt: string | null;
}

export interface AtendimentoMessagesPayload {
  messages: WabaMessage[];
  meta: AtendimentoMessagesMeta;
}

export interface WabaMessage {
  id: string;
  conversation_id: string;
  sender_type: WabaMessageSender;
  sender_id: string | null;
  content_type: WabaContentType;
  content_text: string | null;
  media_url: string | null;
  template_name: string | null;
  wa_message_id: string | null;
  status: WabaMessageStatus;
  error_detail?: string | null;
  created_at: string;
  reply_to_wa_message_id?: string | null;
  reply_to_text?: string | null;
  reply_to_from_me?: boolean | null;
}

export type AtendimentoProvider = "meta" | "baileys" | "evolution";

export interface WabaConfigPublic {
  connected: boolean;
  status: string;
  phone_number_id: string | null;
  display_phone_number: string | null;
  waba_id: string | null;
  /** Para pré-preencher o formulário de configurações (staff). */
  form_verify_token?: string | null;
  reason?: string;
  message?: string;
  coexistence_mode?: boolean;
  is_on_biz_app?: boolean;
  platform_type?: string | null;
  coexistence_active?: boolean;
  /** Provedor ativo: meta ou baileys */
  active_provider?: "meta" | "baileys" | "evolution";
  inbox_connected?: boolean;
  provider_label?: string;
}

export interface WabaAutomation {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  is_active: boolean;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type WabaAutomationTriggerType =
  | "new_message_received"
  | "first_inbound_message"
  | "keyword_match"
  | "new_contact_created"
  | "outside_store_hours"
  | "inside_store_hours";

export const WABA_TRIGGER_LABELS_PT: Record<string, string> = {
  new_message_received: "Nova mensagem recebida",
  first_inbound_message: "Primeira mensagem do contato",
  keyword_match: "Palavra-chave",
  new_contact_created: "Novo contato",
  outside_store_hours: "Fora do horario da loja",
  inside_store_hours: "Dentro do horario da loja",
  conversation_assigned: "Conversa atribuida",
  tag_added: "Tag adicionada",
  time_based: "Horario agendado",
};
