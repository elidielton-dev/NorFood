import type { SupabaseClient } from "@supabase/supabase-js";

/** Tabelas com tenant_id — ordem aproximada (dependentes primeiro). */
const TENANT_SCOPED_TABLES = [
  "waba_automation_logs",
  "waba_automation_steps",
  "waba_automations",
  "waba_messages",
  "waba_conversations",
  "waba_contact_custom_values",
  "waba_contact_tags",
  "waba_contacts",
  "waba_message_templates",
  "waba_tags",
  "waba_custom_fields",
  "waba_config",
  "waba_workspace",
  "whatsapp_messages",
  "whatsapp_chats",
  "whatsapp_config",
  "motoboy_notificacoes",
  "motoboy_mensagens",
  "motoboy_ocorrencias",
  "entregadores_localizacao",
  "rotas_entrega",
  "entregas",
  "notas_fiscais",
  "fiscal_config",
  "empresa_fiscal",
  "lancamentos_financeiros",
  "produto_movimentos_estoque",
  "produto_promocoes",
  "produto_adicionais",
  "produto_ficha_tecnica",
  "produto_variacoes",
  "grupos_adicionais",
  "pedidos",
  "mesas",
  "cupons",
  "produtos",
  "categorias",
  "bairros_entrega",
  "entregador_perfis",
  "staff_atendimento_prefs",
  "config_operacional",
  "horarios_funcionamento",
  "tenant_billing_invoices",
] as const;

export async function purgeTenantData(supabaseAdmin: SupabaseClient, tenantId: string) {
  for (const table of TENANT_SCOPED_TABLES) {
    const { error } = await supabaseAdmin.from(table).delete().eq("tenant_id", tenantId);
    if (error && !error.message.includes("does not exist")) {
      console.warn(`[tenant-delete] ${table}:`, error.message);
    }
  }

  const { error: tenantError } = await supabaseAdmin.from("tenants").delete().eq("id", tenantId);
  if (tenantError) throw tenantError;
}
