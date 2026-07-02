import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ExternalLink, Palette, Save } from "lucide-react";
import { toast } from "sonner";
import { ConfigPageBack } from "@/components/config-hub-ui";
import {
  fetchTenantAdminSettingsServer,
  saveTenantProfileServer,
} from "@/lib/api/tenant-settings-admin.functions";
import { lojaPath } from "@/lib/tenant/painel-routes";
import { useTenant, useTenantSlug } from "@/lib/tenant/tenant-context";
import {
  GestaoButton,
  GestaoCard,
  GestaoField,
  GestaoInput,
  GestaoPage,
  GestaoSectionTitle,
} from "@/components/gestao-ui";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/loja")({
  component: ConfiguracoesLojaPage,
});

function ConfiguracoesLojaPage() {
  const { tenant: ctxTenant } = useTenant();
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tenant-admin-settings", tenantSlug],
    queryFn: () => fetchTenantAdminSettingsServer({ data: tenantSlug! }),
  });

  const [form, setForm] = useState<{
    name: string;
    subtitle: string;
    logo_url: string;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    phone: string;
    address: string;
    description: string;
    delivery_time_minutes: number;
    banner_url: string;
    tagline: string;
  } | null>(null);

  useEffect(() => {
    if (!data || form) return;
    setForm({
      name: data.tenant.name,
      subtitle: data.tenant.subtitle ?? "",
      logo_url: data.tenant.logo_url ?? "",
      primary_color: data.tenant.primary_color,
      secondary_color: data.tenant.secondary_color,
      accent_color: data.tenant.accent_color,
      phone: data.settings.phone ?? "",
      address: data.settings.address ?? "",
      description: data.settings.description ?? "",
      delivery_time_minutes: data.settings.delivery_time_minutes,
      banner_url: data.settings.appearance.banner_url ?? "",
      tagline: data.settings.appearance.tagline ?? "",
    });
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("Formulário indisponível.");
      return saveTenantProfileServer({
        data: {
          tenantSlug: tenantSlug!,
          name: form.name,
          subtitle: form.subtitle || null,
          logo_url: form.logo_url || null,
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          accent_color: form.accent_color,
          phone: form.phone || null,
          address: form.address || null,
          description: form.description || null,
          delivery_time_minutes: form.delivery_time_minutes,
          appearance: {
            banner_url: form.banner_url || null,
            tagline: form.tagline || null,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Dados da loja salvos.");
      void qc.invalidateQueries({ queryKey: ["tenant-admin-settings", tenantSlug] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !form) {
    return (
      <GestaoPage title="Dados e aparência" subtitle="Carregando...">
        <GestaoCard>
          <p className="text-sm text-muted-foreground">Carregando configurações...</p>
        </GestaoCard>
      </GestaoPage>
    );
  }

  const lojaUrl = lojaPath(ctxTenant.slug);

  return (
    <GestaoPage
      title="Dados e aparência"
      subtitle="Identidade da loja no painel e na vitrine online."
      actions={
        <div className="flex flex-wrap gap-2">
          <ConfigPageBack />
          <a href={lojaUrl} target="_blank" rel="noreferrer">
            <GestaoButton variant="secondary">
              <ExternalLink className="size-4" />
              Ver loja
            </GestaoButton>
          </a>
        </div>
      }
    >
      <GestaoCard>
        <GestaoSectionTitle
          title="Marca e cores"
          description="Nome, logo e paleta exibidos para o cliente."
          action={<Palette className="size-5 text-sage" />}
        />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <GestaoField label="Nome do restaurante">
            <GestaoInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </GestaoField>
          <GestaoField label="Subtítulo">
            <GestaoInput
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            />
          </GestaoField>
          <GestaoField label="URL do logo" className="md:col-span-2">
            <GestaoInput
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              placeholder="https://..."
            />
          </GestaoField>
          <GestaoField label="Cor primária">
            <GestaoInput
              type="color"
              value={form.primary_color}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              className="h-11 w-full"
            />
          </GestaoField>
          <GestaoField label="Cor de destaque">
            <GestaoInput
              type="color"
              value={form.accent_color}
              onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
              className="h-11 w-full"
            />
          </GestaoField>
          <GestaoField label="Banner (URL)" className="md:col-span-2">
            <GestaoInput
              value={form.banner_url}
              onChange={(e) => setForm({ ...form, banner_url: e.target.value })}
              placeholder="https://..."
            />
          </GestaoField>
        </div>
        {form.logo_url ? (
          <img src={form.logo_url} alt="Logo" className="mt-4 h-16 w-auto object-contain" />
        ) : null}
      </GestaoCard>

      <GestaoCard>
        <GestaoSectionTitle title="Contato e descrição" description="Informações da vitrine e do delivery." />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <GestaoField label="Telefone / WhatsApp">
            <GestaoInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </GestaoField>
          <GestaoField label="Tempo médio de entrega (min)">
            <GestaoInput
              type="number"
              min={5}
              value={form.delivery_time_minutes}
              onChange={(e) =>
                setForm({ ...form, delivery_time_minutes: Number(e.target.value) || 40 })
              }
            />
          </GestaoField>
          <GestaoField label="Endereço" className="md:col-span-2">
            <GestaoInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </GestaoField>
          <GestaoField label="Descrição da loja" className="md:col-span-2">
            <Textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="resize-y"
            />
          </GestaoField>
          <GestaoField label="Frase de destaque (opcional)" className="md:col-span-2">
            <GestaoInput value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
          </GestaoField>
        </div>
        <GestaoButton className="mt-4" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="size-4" />
          Salvar loja
        </GestaoButton>
      </GestaoCard>
    </GestaoPage>
  );
}
