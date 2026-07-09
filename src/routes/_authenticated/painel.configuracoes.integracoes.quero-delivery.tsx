import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  ConfigSection,
  ConfigSettingRow,
  ConfigSwitchRow,
  ConfiguracoesPageFrame,
} from "@/components/configuracoes/configuracoes-page-frame";
import { GestaoButton, GestaoInput } from "@/components/painel/gestao-ui";
import {
  fetchQueroDeliveryIntegrationServer,
  runQueroCatalogSyncServer,
  runQueroDeliveryPollServer,
  saveQueroDeliveryIntegrationServer,
} from "@/lib/integrations/quero-delivery/quero-delivery.functions";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import { tenantPath } from "@/lib/tenant/painel-routes";

export const Route = createFileRoute(
  "/_authenticated/painel/configuracoes/integracoes/quero-delivery",
)({
  component: QueroDeliveryIntegracaoPage,
});

function QueroDeliveryIntegracaoPage() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["quero-delivery-integration", tenantSlug],
    queryFn: () => fetchQueroDeliveryIntegrationServer({ data: tenantSlug }),
  });

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [apiToken, setApiToken] = useState("");

  const activeEnabled = enabled ?? data?.enabled ?? false;
  const activePlaceId = placeId ?? data?.placeId ?? "";

  const saveMutation = useMutation({
    mutationFn: () =>
      saveQueroDeliveryIntegrationServer({
        data: {
          tenantSlug,
          enabled: activeEnabled,
          placeId: activePlaceId,
          apiToken: apiToken || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Integracao Quero Delivery salva.");
      setApiToken("");
      void qc.invalidateQueries({ queryKey: ["quero-delivery-integration", tenantSlug] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pollMutation = useMutation({
    mutationFn: () => runQueroDeliveryPollServer({ data: tenantSlug }),
    onSuccess: (result) => {
      toast.success(`Poll concluido. ${result.imported} pedido(s) importado(s).`);
      void qc.invalidateQueries({ queryKey: ["quero-delivery-integration", tenantSlug] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const catalogMutation = useMutation({
    mutationFn: () => runQueroCatalogSyncServer({ data: tenantSlug }),
    onSuccess: (result) => {
      toast.success(`Catalogo sincronizado. ${result.pushed} produto(s) enviado(s).`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <ConfiguracoesPageFrame
      title="Quero Delivery"
      description="Sincronize pedidos e catalogo com a plataforma Quero Delivery."
      actions={
        <GestaoButton onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="size-4" />
          Salvar
        </GestaoButton>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <ConfigSection title="Credenciais do restaurante" description="Place ID e token fornecidos pelo Quero Delivery.">
            <ConfigSwitchRow
              label="Integracao ativa"
              checked={activeEnabled}
              onCheckedChange={setEnabled}
              description="Habilita polling de pedidos para este restaurante."
            />
            <ConfigSettingRow
              description="Identificador do estabelecimento na Quero Delivery."
              control={
                <GestaoInput
                  value={activePlaceId}
                  onChange={(event) => setPlaceId(event.target.value)}
                  placeholder="placeId"
                />
              }
            />
            <ConfigSettingRow
              description={
                data?.hasToken
                  ? "Token ja configurado. Informe um novo valor apenas para substituir."
                  : "Token de API do Quero Delivery."
              }
              control={
                <GestaoInput
                  type="password"
                  value={apiToken}
                  onChange={(event) => setApiToken(event.target.value)}
                  placeholder={data?.hasToken ? "••••••••" : "api token"}
                />
              }
            />
          </ConfigSection>

          <ConfigSection title="Status" description="Ultima sincronizacao e pedidos importados.">
            <p className="text-sm text-muted-foreground">
              Pedidos importados: <strong>{data?.importedOrders ?? 0}</strong>
            </p>
            <p className="text-sm text-muted-foreground">
              Ultimo poll: {data?.lastPollAt ? new Date(data.lastPollAt).toLocaleString("pt-BR") : "—"}
            </p>
            {data?.lastError ? (
              <p className="text-sm text-rose-600">Ultimo erro: {data.lastError}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <GestaoButton
                variant="secondary"
                onClick={() => pollMutation.mutate()}
                disabled={pollMutation.isPending}
              >
                <RefreshCw className={`size-4 ${pollMutation.isPending ? "animate-spin" : ""}`} />
                Sincronizar pedidos agora
              </GestaoButton>
              <GestaoButton
                variant="secondary"
                onClick={() => catalogMutation.mutate()}
                disabled={catalogMutation.isPending}
              >
                Sincronizar catalogo
              </GestaoButton>
            </div>
          </ConfigSection>

          {data?.logs?.length ? (
            <ConfigSection title="Logs recentes" description="Ultimas execucoes de sincronizacao.">
              <div className="space-y-2">
                {data.logs.map((log) => (
                  <p key={`${log.created_at}-${log.message}`} className="rounded-lg bg-[#F9FAFB] px-3 py-2 text-sm">
                    <span className="font-semibold">{log.level}</span> ·{" "}
                    {new Date(log.created_at).toLocaleString("pt-BR")} — {log.message}
                  </p>
                ))}
              </div>
            </ConfigSection>
          ) : null}

          <Link
            to={tenantPath(tenantSlug, "configuracoes/integracoes")}
            className="inline-block text-sm font-medium text-[var(--tenant-primary,#FF7A00)] hover:underline"
          >
            Voltar para integrações
          </Link>
        </>
      )}
    </ConfiguracoesPageFrame>
  );
}
