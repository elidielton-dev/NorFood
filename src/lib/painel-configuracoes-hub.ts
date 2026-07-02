import type { LucideIcon } from "lucide-react";
import {
  Bike,
  Clock,
  CreditCard,
  Palette,
  Printer,
  Receipt,
  Settings2,
  Store,
  UserCog,
  Utensils,
  Wallet,
} from "lucide-react";

import { mapLegacyPainelPath } from "@/lib/tenant/painel-routes";

export type ConfigHubItem = {
  key: string;
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
  badge?: string;
};

export type ConfigHubSection = {
  key: string;
  title: string;
  description: string;
  items: ConfigHubItem[];
};

export const CONFIG_HUB_SECTIONS: ConfigHubSection[] = [
  {
    key: "loja",
    title: "Loja e operação",
    description: "Dados do restaurante, horários e regras do dia a dia.",
    items: [
      {
        key: "loja",
        title: "Dados e aparência",
        description: "Nome, logo, cores, telefone e descrição da loja.",
        to: "/painel/configuracoes/loja",
        icon: Palette,
      },
      {
        key: "horarios",
        title: "Horários de funcionamento",
        description: "Grade semanal, pausa imediata e status aberto/fechado.",
        to: "/painel/configuracoes/horarios",
        icon: Clock,
      },
      {
        key: "operacao",
        title: "Operação e delivery",
        description: "Pedido mínimo, taxas, bairros atendidos e fidelidade.",
        to: "/painel/configuracoes/operacao",
        icon: Store,
      },
    ],
  },
  {
    key: "salao",
    title: "Salão e mesas",
    description: "Cadastro de mesas, QR codes e impressão do salão.",
    items: [
      {
        key: "mesas",
        title: "Mesas do salão",
        description: "Criar mesas, capacidade e tokens para cardápio QR.",
        to: "/painel/configuracoes/mesas",
        icon: Utensils,
      },
      {
        key: "impressoras-mesas",
        title: "Impressora do salão",
        description: "Comandas e recibos das mesas.",
        to: "/painel/configuracoes/impressoras/mesas",
        icon: Printer,
      },
    ],
  },
  {
    key: "delivery",
    title: "Delivery e entregadores",
    description: "Tempo de entrega, app do motoboy e expedição.",
    items: [
      {
        key: "delivery",
        title: "Configurações de delivery",
        description: "Tempo estimado, links do app entregador e expedição.",
        to: "/painel/configuracoes/delivery",
        icon: Bike,
      },
      {
        key: "impressoras-delivery",
        title: "Impressora expedição",
        description: "Etiquetas e comprovantes de saída.",
        to: "/painel/configuracoes/impressoras/delivery",
        icon: Printer,
      },
    ],
  },
  {
    key: "pagamentos",
    title: "Pagamentos e integrações",
    description: "Formas aceitas e conexões com gateways.",
    items: [
      {
        key: "pagamentos",
        title: "Meios de pagamento",
        description: "Pix, dinheiro e cartão aceitos na loja e no delivery.",
        to: "/painel/configuracoes/pagamentos",
        icon: CreditCard,
      },
      {
        key: "integracoes",
        title: "Integrações",
        description: "Mercado Pago, Banco Inter, Quero Delivery e WhatsApp.",
        to: "/painel/configuracoes/integracoes",
        icon: Settings2,
      },
      {
        key: "mp-conta",
        title: "Conta Mercado Pago",
        description: "Saldo, movimentações e status da conta.",
        to: "/painel/financeiro/mercado-pago",
        icon: Wallet,
        badge: "Financeiro",
      },
    ],
  },
  {
    key: "fiscal",
    title: "Fiscal e impressão",
    description: "NFC-e, certificado e impressoras operacionais.",
    items: [
      {
        key: "fiscal",
        title: "Configuração fiscal",
        description: "Empresa, certificado A1, CSC e emissão automática.",
        to: "/painel/fiscal/configuracoes",
        icon: Receipt,
      },
      {
        key: "impressoras",
        title: "Impressoras",
        description: "KDS, cozinha, fiscal e demais painéis.",
        to: "/painel/configuracoes/impressoras",
        icon: Printer,
      },
    ],
  },
  {
    key: "conta",
    title: "Equipe e conta Norfood",
    description: "Acesso do time e assinatura da plataforma.",
    items: [
      {
        key: "equipe",
        title: "Colaboradores",
        description: "Usuários, papéis e permissões do painel.",
        to: "/painel/configuracoes/equipe",
        icon: UserCog,
      },
      {
        key: "plano",
        title: "Plano e faturamento",
        description: "Assinatura Norfood, faturas e período de trial.",
        to: "/painel/configuracoes/plano",
        icon: Wallet,
      },
    ],
  },
];

function mapHubPath(tenantSlug: string, legacyPath: string) {
  return mapLegacyPainelPath(legacyPath, tenantSlug) ?? legacyPath;
}

/** Links do hub com rotas tenant (/t/:slug/...). */
export function getConfigHubSections(tenantSlug: string): ConfigHubSection[] {
  return CONFIG_HUB_SECTIONS.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      to: mapHubPath(tenantSlug, item.to),
    })),
  }));
}
