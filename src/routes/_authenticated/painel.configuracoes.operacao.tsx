import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  ConfigSection,
  ConfigSettingRow,
  ConfigSwitchRow,
  ConfiguracoesPageFrame,
} from "@/components/configuracoes/configuracoes-page-frame";
import {
  deleteBairroEntregaServer,
  fetchOperationalAdminServer,
  saveBairroEntregaServer,
  saveOperationalConfigServer,
  type BairroEntrega,
  type OperationalConfig,

} from "@/lib/api/tenant/operational-config.functions";
import { tenantPath } from "@/lib/tenant/painel-routes";

import { useTenantSlug } from "@/lib/tenant/tenant-context";
import {
  GestaoAlert,
  GestaoButton,
  GestaoField,
  GestaoInput,
  GestaoTable,
  GestaoTableHead,
  GestaoToolbar,
} from "@/components/painel/gestao-ui";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/operacao")({
  component: ConfiguracaoOperacaoPage,
});

function ConfiguracaoOperacaoPage() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["operational-admin", tenantSlug],
    queryFn: () => fetchOperationalAdminServer({ data: tenantSlug }),
  });

  const [config, setConfig] = useState<OperationalConfig | null>(null);
  const [novoBairro, setNovoBairro] = useState({
    nome: "",
    taxa: 5,
    latitude: "",
    longitude: "",
    ativo: true,
  });

  const activeConfig = config ?? data?.config ?? null;

  const saveConfigMutation = useMutation({
    mutationFn: (payload: OperationalConfig) =>
      saveOperationalConfigServer({ data: { ...payload, tenantSlug } }),
    onSuccess: () => {
      toast.success("Configuração operacional salva.");
      void qc.invalidateQueries({ queryKey: ["operational-admin", tenantSlug] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveBairroMutation = useMutation({
    mutationFn: (payload: {
      id?: string;
      nome: string;
      taxa: number;
      latitude?: number | null;
      longitude?: number | null;
      ativo: boolean;
    }) => saveBairroEntregaServer({ data: { ...payload, tenantSlug } }),
    onSuccess: () => {
      toast.success("Bairro salvo.");
      setNovoBairro({ nome: "", taxa: 5, latitude: "", longitude: "", ativo: true });
      void qc.invalidateQueries({ queryKey: ["operational-admin", tenantSlug] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteBairroMutation = useMutation({
    mutationFn: (id: string) => deleteBairroEntregaServer({ data: { id, tenantSlug } }),
    onSuccess: () => {
      toast.success("Bairro removido.");
      void qc.invalidateQueries({ queryKey: ["operational-admin", tenantSlug] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !activeConfig) {
    return (
      <ConfiguracoesPageFrame title="Operação da loja" description="Carregando...">
        <p className="text-sm text-muted-foreground">Carregando operação...</p>
      </ConfiguracoesPageFrame>
    );
  }

  return (
    <ConfiguracoesPageFrame
      title="Operação da loja"
      description="Pedido mínimo, taxa de entrega, fidelidade e bairros atendidos."
      actions={
        <GestaoButton onClick={() => saveConfigMutation.mutate(activeConfig)} disabled={saveConfigMutation.isPending}>
          <Save className="size-4" />
          Salvar
        </GestaoButton>
      }
    >
      <GestaoAlert tone="info">
        Horários, pausa imediata e abertura programada estão em{" "}
        <Link to={tenantPath(tenantSlug, "configuracoes/horarios")} className="font-semibold underline">
          Horários de funcionamento
        </Link>
        . Regras operacionais (pedido mínimo, taxas, abertura) são salvas em configuração operacional.
      </GestaoAlert>

      {activeConfig.horario_automatico && !activeConfig.pausa_imediata ? (
        <GestaoAlert tone="warning">
          O horário automático está ativo. A loja abre e fecha pela grade semanal. Para controlar
          manualmente, use o toggle abaixo (isso desativa o automático ao salvar) ou use Pausa
          imediata em Horários.
          {typeof activeConfig.loja_aberta_efetiva === "boolean" ? (
            <span className="mt-1 block font-semibold">
              Status efetivo agora: {activeConfig.loja_aberta_efetiva ? "Aberta" : "Fechada"}
            </span>
          ) : null}
        </GestaoAlert>
      ) : null}

      {activeConfig.pausa_imediata ? (
        <GestaoAlert tone="warning">
          Pausa imediata ativa — a loja está fechada para pedidos até ser desativada em Horários.
        </GestaoAlert>
      ) : null}

      <ConfigSection
        title="Regras comerciais"
        description="Valores padrão usados no delivery e no programa de fidelidade."
      >
        <ConfigSettingRow
          description="Valor mínimo para aceitar um pedido na loja online e no balcão."
          control={
            <GestaoInput
              type="number"
              step="0.01"
              className="w-32"
              value={activeConfig.pedido_minimo}
              onChange={(e) =>
                setConfig({ ...activeConfig, pedido_minimo: Number(e.target.value) })
              }
            />
          }
        />
        <ConfigSettingRow
          description="Taxa de entrega quando o bairro do cliente não está cadastrado."
          control={
            <GestaoInput
              type="number"
              step="0.01"
              className="w-32"
              value={activeConfig.valor_padrao_entrega}
              onChange={(e) =>
                setConfig({ ...activeConfig, valor_padrao_entrega: Number(e.target.value) })
              }
            />
          }
        />
        <ConfigSettingRow
          description="Quantidade de pontos de fidelidade creditados a cada R$ 1 em compras."
          control={
            <GestaoInput
              type="number"
              step="0.1"
              className="w-32"
              value={activeConfig.pontos_por_real}
              onChange={(e) =>
                setConfig({ ...activeConfig, pontos_por_real: Number(e.target.value) })
              }
            />
          }
        />
        <ConfigSwitchRow
          description="Abre ou fecha a loja manualmente. Ao salvar, o horário automático é desativado."
          label="Loja aberta agora"
          checked={activeConfig.loja_aberta}
          onCheckedChange={(loja_aberta) => setConfig({ ...activeConfig, loja_aberta })}
        />
        {typeof activeConfig.loja_aberta_efetiva === "boolean" ? (
          <p className="text-sm text-muted-foreground">
            Status efetivo para pedidos:{" "}
            <strong>{activeConfig.loja_aberta_efetiva ? "Aberta" : "Fechada"}</strong>
          </p>
        ) : null}
      </ConfigSection>

      <ConfigSection title="Bairros de entrega" description="Taxas e áreas atendidas no delivery.">
        <GestaoToolbar className="mb-4">
          <GestaoField label="Nome" className="min-w-0 flex-1 md:min-w-[180px]">
            <GestaoInput
              placeholder="Nome do bairro"
              value={novoBairro.nome}
              onChange={(e) => setNovoBairro((c) => ({ ...c, nome: e.target.value }))}
            />
          </GestaoField>
          <GestaoField label="Taxa" className="w-full sm:w-28">
            <GestaoInput
              type="number"
              step="0.01"
              placeholder="Taxa"
              value={novoBairro.taxa}
              onChange={(e) => setNovoBairro((c) => ({ ...c, taxa: Number(e.target.value) }))}
            />
          </GestaoField>
          <GestaoField label="Latitude" className="w-full sm:w-36">
            <GestaoInput
              placeholder="Latitude"
              value={novoBairro.latitude}
              onChange={(e) => setNovoBairro((c) => ({ ...c, latitude: e.target.value }))}
            />
          </GestaoField>
          <GestaoField label="Longitude" className="w-full sm:w-36">
            <GestaoInput
              placeholder="Longitude"
              value={novoBairro.longitude}
              onChange={(e) => setNovoBairro((c) => ({ ...c, longitude: e.target.value }))}
            />
          </GestaoField>
          <GestaoButton
            variant="secondary"
            className="w-full sm:w-auto sm:self-end"
            onClick={() => {
              if (!novoBairro.nome.trim()) return toast.error("Informe o nome do bairro.");
              saveBairroMutation.mutate({
                nome: novoBairro.nome,
                taxa: novoBairro.taxa,
                latitude: novoBairro.latitude ? Number(novoBairro.latitude) : null,
                longitude: novoBairro.longitude ? Number(novoBairro.longitude) : null,
                ativo: novoBairro.ativo,
              });
            }}
          >
            Adicionar bairro
          </GestaoButton>
        </GestaoToolbar>

        <GestaoTable>
          <GestaoTableHead>
            <tr>
              <th className="p-3">Bairro</th>
              <th className="p-3">Taxa</th>
              <th className="p-3 hidden sm:table-cell">Ativo</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </GestaoTableHead>
          <tbody>
            {(data?.bairros ?? []).map((bairro: BairroEntrega) => (
              <BairroRow
                key={bairro.id}
                bairro={bairro}
                onSave={(payload) => saveBairroMutation.mutate(payload)}
                onDelete={() => deleteBairroMutation.mutate(bairro.id)}
              />
            ))}
          </tbody>
        </GestaoTable>
      </ConfigSection>
    </ConfiguracoesPageFrame>
  );
}

function BairroRow({
  bairro,
  onSave,
  onDelete,
}: {
  bairro: BairroEntrega;
  onSave: (payload: {
    id: string;
    nome: string;
    taxa: number;
    latitude?: number | null;
    longitude?: number | null;
    ativo: boolean;
  }) => void;
  onDelete: () => void;
}) {
  const [nome, setNome] = useState(bairro.nome);
  const [taxa, setTaxa] = useState(bairro.taxa);
  const [ativo, setAtivo] = useState(bairro.ativo);

  return (
    <tr className="border-t border-[#F3F4F6]">
      <td className="p-3">
        <GestaoInput value={nome} onChange={(e) => setNome(e.target.value)} className="h-9" />
      </td>
      <td className="p-3">
        <GestaoInput
          type="number"
          step="0.01"
          value={taxa}
          onChange={(e) => setTaxa(Number(e.target.value))}
          className="h-9 w-24"
        />
      </td>
      <td className="p-3 hidden sm:table-cell">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          {ativo ? "Ativo" : "Inativo"}
        </label>
      </td>
      <td className="p-3 text-right">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <GestaoButton
            variant="secondary"
            size="sm"
            onClick={() =>
              onSave({
                id: bairro.id,
                nome,
                taxa,
                ativo,
                latitude: bairro.latitude,
                longitude: bairro.longitude,
              })
            }
          >
            Salvar
          </GestaoButton>
          <GestaoButton variant="danger" size="sm" onClick={onDelete}>
            <Trash2 className="size-4" />
          </GestaoButton>
        </div>
      </td>
    </tr>
  );
}
