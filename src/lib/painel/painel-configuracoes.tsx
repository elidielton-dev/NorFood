import { CreditCard, Landmark, MessageCircle, Receipt, Store, type LucideIcon } from "lucide-react";
import { getIntegrationStatus } from "@/lib/api/tenant/integrations.functions";

export type PrinterPanelKey = "mesas" | "kds" | "delivery" | "fiscal";

export type PrinterPanelConfig = {
  key: PrinterPanelKey;
  titulo: string;
  descricao: string;
  printerName: string;
  copies: number;
  paper: string;
  autoPrint: boolean;
  cutPaper: boolean;
  showPreview: boolean;
  itens: string[];
  route: string;
};

export type IntegrationKey = "inter" | "mercadoPago" | "fiscal" | "queroDelivery" | "whatsapp";

export type IntegrationStatusSnapshot = Awaited<ReturnType<typeof getIntegrationStatus>>;

export type IntegrationConfig = {
  key: IntegrationKey;
  titulo: string;
  descricao: string;
  icon: LucideIcon;
  route: string;
  envs: string[];
  details: (data: IntegrationStatusSnapshot | undefined) => string[];
  isActive: (data: IntegrationStatusSnapshot | undefined) => boolean;
};

export const printerPanels: PrinterPanelConfig[] = [
  {
    key: "mesas",
    titulo: "Mesas",
    descricao: "Comandas, abertura de mesa, fechamento e recibos do salao.",
    printerName: "Impressora Salao",
    copies: 1,
    paper: "80mm",
    autoPrint: true,
    cutPaper: true,
    showPreview: false,
    itens: [
      "Imprimir abertura de mesa automaticamente",
      "Enviar conta parcial e fechamento para a mesma impressora",
      "Separar impressao de recibo e comanda do salao",
    ],
    route: "/painel/configuracoes/impressoras/mesas",
  },
  {
    key: "kds",
    titulo: "KDS",
    descricao: "Pedidos da cozinha, fila de preparo e recibos operacionais.",
    printerName: "Impressora Cozinha",
    copies: 2,
    paper: "58mm",
    autoPrint: true,
    cutPaper: true,
    showPreview: false,
    itens: [
      "Imprimir novo pedido assim que entrar no painel",
      "Separar uma via da cozinha e outra de expedicao",
      "Imprimir somente pedidos delivery no KDS",
    ],
    route: "/painel/configuracoes/impressoras/kds",
  },
  {
    key: "delivery",
    titulo: "Delivery",
    descricao: "Pedidos em rota, etiquetas de saida e comprovantes do entregador.",
    printerName: "Impressora Expedicao",
    copies: 1,
    paper: "80mm",
    autoPrint: true,
    cutPaper: true,
    showPreview: true,
    itens: [
      "Imprimir etiqueta de saida ao marcar pedido pronto",
      "Gerar comprovante para entregador com endereco e pagamento",
      "Permitir pre-visualizacao antes de enviar para impressora",
    ],
    route: "/painel/configuracoes/impressoras/delivery",
  },
  {
    key: "fiscal",
    titulo: "Fiscal",
    descricao: "Cupons, comprovantes de pagamento e documentos fiscais.",
    printerName: "Impressora Caixa",
    copies: 1,
    paper: "80mm",
    autoPrint: false,
    cutPaper: true,
    showPreview: true,
    itens: [
      "Imprimir comprovante de pagamento automaticamente",
      "Separar recibo interno e via do cliente",
      "Exigir pre-visualizacao antes de documentos sensiveis",
    ],
    route: "/painel/configuracoes/impressoras/fiscal",
  },
];

export const integrationConfigs: IntegrationConfig[] = [
  {
    key: "inter",
    titulo: "Banco Inter",
    descricao: "Pix, cobranca, saldo, extrato e webhook bancario.",
    icon: Landmark,
    route: "/painel/configuracoes/integracoes/inter",
    envs: ["INTER_CLIENT_ID", "INTER_CLIENT_SECRET", "INTER_CERT_PATH", "INTER_KEY_PATH"],
    details: (data) => [
      `Escopos: ${data?.inter.scopes ?? "carregando..."}`,
      `Webhook: ${data?.inter.webhookUrl || "nao configurado"}`,
    ],
    isActive: (data) => Boolean(data?.inter.enabled),
  },
  {
    key: "mercadoPago",
    titulo: "Mercado Pago",
    descricao: "Checkout, Pix, cartao, link de pagamento e webhook.",
    icon: CreditCard,
    route: "/painel/configuracoes/integracoes/mercado-pago",
    envs: ["MP_ACCESS_TOKEN", "VITE_MP_PUBLIC_KEY", "MP_WEBHOOK_URL", "MP_ENVIRONMENT"],
    details: (data) => [
      `Ambiente: ${data?.mercadoPago.environment ?? "sandbox"}`,
      `Public key: ${data?.mercadoPago.publicKeyConfigured ? "configurada" : "nao configurada"}`,
      `Webhook: ${data?.mercadoPago.webhookUrl || "nao configurado"}`,
    ],
    isActive: (data) => Boolean(data?.mercadoPago.enabled),
  },
  {
    key: "fiscal",
    titulo: "Fiscal",
    descricao: "NFC-e, NF-e, XML, DANFE e envio para contabilidade.",
    icon: Receipt,
    route: "/painel/fiscal/configuracoes",
    envs: ["FISCAL_PROVIDER", "ENCRYPTION_KEY", "FISCAL_ENVIRONMENT"],
    details: (data) => [
      `Provider: ${data?.fiscal.provider ?? "sefaz"} (direto)`,
      `Ambiente: ${data?.fiscal.environment ?? "homologacao"}`,
    ],
    isActive: (data) => Boolean(data?.fiscal.enabled),
  },
  {
    key: "queroDelivery",
    titulo: "Quero Delivery",
    descricao: "Recebimento de pedidos externos e sincronizacao de status.",
    icon: Store,
    route: "/painel/configuracoes/integracoes/quero-delivery",
    envs: ["QUERO_DELIVERY_API_URL", "QUERO_DELIVERY_TOKEN"],
    details: (data) => [`API URL: ${data?.queroDelivery.apiUrl || "nao configurada"}`],
    isActive: (data) => Boolean(data?.queroDelivery.enabled),
  },
  {
    key: "whatsapp",
    titulo: "WhatsApp Meta",
    descricao: "API oficial Business — conversas, contatos e automacoes.",
    icon: MessageCircle,
    route: "/painel/atendimento/configuracoes",
    envs: ["META_APP_SECRET", "ENCRYPTION_KEY", "WABA_WEBHOOK_URL"],
    details: (data) => [
      `Instancia: ${data?.whatsapp.instanceName ?? "abelha-mel"}`,
      `Webhook: ${data?.whatsapp.webhookUrl || "nao configurado"}`,
    ],
    isActive: (data) => Boolean(data?.whatsapp.enabled),
  },
];

export function getPrinterPanelConfig(key: PrinterPanelKey) {
  return printerPanels.find((panel) => panel.key === key);
}

export function getIntegrationConfig(key: IntegrationKey) {
  return integrationConfigs.find((integration) => integration.key === key);
}
