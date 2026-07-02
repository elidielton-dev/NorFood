import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Plus, QrCode, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  ConfigSection,
  ConfigSwitchRow,
  ConfiguracoesPageFrame,
} from "@/components/configuracoes/configuracoes-page-frame";
import {
  deleteMesaAdminServer,
  fetchMesasAdminServer,
  saveMesaAdminServer,
  seedMesasAdminServer,
} from "@/lib/api/mesas-admin.functions";
import {
  fetchTenantAdminSettingsServer,
  saveMesasSettingsServer,
} from "@/lib/api/tenant-settings-admin.functions";
import { DEFAULT_MESAS_SETTINGS } from "@/lib/mesas-settings";
import { lojaPath } from "@/lib/tenant/painel-routes";
import { useTenant, useTenantSlug } from "@/lib/tenant/tenant-context";
import { tenantQueryKey } from "@/lib/tenant/query-keys";
import {
  GestaoButton,
  GestaoField,
  GestaoInput,
  GestaoTable,
  GestaoTableHead,
  GestaoEmptyState,
} from "@/components/gestao-ui";
import { printMesaQrCode } from "@/lib/print";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/mesas")({
  component: ConfiguracoesMesasPage,
});

function ConfiguracoesMesasPage() {
  const { tenant } = useTenant();
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  const [nova, setNova] = useState({ numero: "", capacidade: "4" });

  const { data: mesas = [], isLoading } = useQuery({
    queryKey: tenantQueryKey("mesas-admin", tenantSlug),
    queryFn: () => fetchMesasAdminServer({ data: tenantSlug! }),
  });

  const { data: adminSettings } = useQuery({
    queryKey: ["tenant-admin-settings", tenantSlug],
    queryFn: () => fetchTenantAdminSettingsServer({ data: tenantSlug! }),
  });

  const mesasSettings = adminSettings?.settings.mesas ?? DEFAULT_MESAS_SETTINGS;

  const mesasSettingsMutation = useMutation({
    mutationFn: (qrAutoPrintKitchen: boolean) =>
      saveMesasSettingsServer({
        data: {
          tenantSlug: tenantSlug!,
          mesas: {
            ...(adminSettings?.settings.mesas ?? DEFAULT_MESAS_SETTINGS),
            qrAutoPrintKitchen,
          },
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tenant-admin-settings", tenantSlug] });
      toast.success("Configuração de mesas salva.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: tenantQueryKey("mesas", tenantSlug) });
    void qc.invalidateQueries({ queryKey: tenantQueryKey("mesas-admin", tenantSlug) });
  };

  const seedMutation = useMutation({
    mutationFn: (count: number) => seedMesasAdminServer({ data: { tenantSlug: tenantSlug!, count } }),
    onSuccess: (result) => {
      toast.success(`${result.created} mesa(s) criada(s).`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: saveMesaAdminServer,
    onSuccess: () => {
      toast.success("Mesa salva.");
      setNova({ numero: "", capacidade: "4" });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (mesaId: string) =>
      deleteMesaAdminServer({ data: { tenantSlug: tenantSlug!, mesaId } }),
    onSuccess: () => {
      toast.success("Mesa removida.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function cardapioUrl(token: string) {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/cardapio/${token}`;
  }

  return (
    <ConfiguracoesPageFrame
      title="Mesas do salão"
      description="Cadastre mesas para o painel de salão e cardápio por QR Code."
    >
      <ConfigSection
        title="Pedidos pelo QR Code"
        description="Comportamento quando o cliente faz pedido escaneando o QR da mesa."
      >
        <ConfigSwitchRow
          label="Impressão automática na cozinha"
          description="Com o KDS Cozinha aberto, envia o pedido para a impressora assim que chegar pelo QR Code."
          checked={mesasSettings.qrAutoPrintKitchen}
          disabled={mesasSettingsMutation.isPending}
          onCheckedChange={(checked) => mesasSettingsMutation.mutate(checked)}
        />
      </ConfigSection>

      <ConfigSection title="Criação rápida" description="Gera mesas 1 a 12 ou complementa até 20.">
        <div className="flex flex-wrap gap-2">
          <GestaoButton variant="secondary" onClick={() => seedMutation.mutate(12)} disabled={seedMutation.isPending}>
            <Wand2 className="size-4" />
            Criar mesas 1–12
          </GestaoButton>
          <GestaoButton variant="secondary" onClick={() => seedMutation.mutate(20)} disabled={seedMutation.isPending}>
            Completar até 20
          </GestaoButton>
        </div>
      </ConfigSection>

      <ConfigSection title="Nova mesa" description="Número único dentro do seu restaurante.">
        <div className="flex flex-wrap items-end gap-3">
          <GestaoField label="Número">
            <GestaoInput
              type="number"
              min={1}
              value={nova.numero}
              onChange={(e) => setNova((c) => ({ ...c, numero: e.target.value }))}
              className="w-28"
            />
          </GestaoField>
          <GestaoField label="Capacidade">
            <GestaoInput
              type="number"
              min={1}
              value={nova.capacidade}
              onChange={(e) => setNova((c) => ({ ...c, capacidade: e.target.value }))}
              className="w-28"
            />
          </GestaoField>
          <GestaoButton
            onClick={() => {
              const numero = Number(nova.numero);
              const capacidade = Number(nova.capacidade);
              if (!Number.isFinite(numero) || numero < 1) return toast.error("Informe o número da mesa.");
              saveMutation.mutate({
                data: { tenantSlug: tenantSlug!, numero, capacidade: capacidade || 4 },
              });
            }}
          >
            <Plus className="size-4" />
            Adicionar
          </GestaoButton>
        </div>
      </ConfigSection>

      <ConfigSection
        title={`Mesas cadastradas (${mesas.length})`}
        description="Use o painel Mesas para abrir pedidos. O QR aponta para o cardápio digital."
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : mesas.length === 0 ? (
          <GestaoEmptyState
            title="Nenhuma mesa cadastrada"
            description="Clique em Criar mesas 1–12 para começar."
          />
        ) : (
          <GestaoTable>
            <GestaoTableHead>
              <tr>
                <th className="p-3">Mesa</th>
                <th className="p-3">Capacidade</th>
                <th className="p-3 hidden md:table-cell">QR / Cardápio</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </GestaoTableHead>
            <tbody>
              {mesas.map((mesa) => (
                <tr key={mesa.id} className="border-t border-[#F3F4F6]">
                  <td className="p-3 font-semibold">#{mesa.numero}</td>
                  <td className="p-3">{mesa.capacidade} lugares</td>
                  <td className="p-3 hidden md:table-cell">
                    <code className="text-xs">{cardapioUrl(mesa.qrcode_token)}</code>
                  </td>
                  <td className="p-3 capitalize">{mesa.status}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <GestaoButton
                        variant="secondary"
                        size="sm"
                        title="Imprimir QR Code"
                        onClick={() => {
                          void printMesaQrCode({
                            url: cardapioUrl(mesa.qrcode_token),
                            mesaNumero: mesa.numero,
                            tenantName: tenant.name,
                          }).catch((error: unknown) => {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Não foi possível imprimir o QR Code.",
                            );
                          });
                        }}
                      >
                        <QrCode className="size-4" />
                      </GestaoButton>
                      <GestaoButton
                        variant="secondary"
                        size="sm"
                        title="Copiar link do cardápio"
                        onClick={() => {
                          void navigator.clipboard.writeText(cardapioUrl(mesa.qrcode_token));
                          toast.success("Link copiado.");
                        }}
                      >
                        <Copy className="size-4" />
                      </GestaoButton>
                      <GestaoButton
                        variant="danger"
                        size="sm"
                        onClick={() => deleteMutation.mutate(mesa.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="size-4" />
                      </GestaoButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </GestaoTable>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Loja pública:{" "}
          <a href={lojaPath(tenant.slug)} className="underline" target="_blank" rel="noreferrer">
            {lojaPath(tenant.slug)}
          </a>
        </p>
      </ConfigSection>
    </ConfiguracoesPageFrame>
  );
}
