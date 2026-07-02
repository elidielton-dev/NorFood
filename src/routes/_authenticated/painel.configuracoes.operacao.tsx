import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MapPinned, Save, Settings2, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfigPageBack } from "@/components/config-hub-ui";
import {
  deleteBairroEntregaServer,
  fetchOperationalAdminServer,
  saveBairroEntregaServer,
  saveOperationalConfigServer,
  type BairroEntrega,
  type OperationalConfig,
} from "@/lib/api/operational-config.functions";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import {
  GestaoButton,
  GestaoCard,
  GestaoField,
  GestaoInput,
  GestaoPage,
  GestaoSectionTitle,
  GestaoTable,
  GestaoTableHead,
  GestaoToolbar,
} from "@/components/gestao-ui";

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
      <GestaoPage title="Operacao da loja" subtitle="Carregando configuracoes...">
        <GestaoCard>
          <p className="text-sm text-muted-foreground">Carregando operacao...</p>
        </GestaoCard>
      </GestaoPage>
    );
  }

  return (
    <GestaoPage
      title="Operacao da loja"
      subtitle="Pedido minimo, taxa de entrega e bairros atendidos."
      actions={<ConfigPageBack />}
    >
      <div className="space-y-6">
        <GestaoCard className="border-sky-200 bg-sky-50/50">
          <p className="text-sm text-sky-900">
            Horarios, pausa imediata e abertura da loja estao em{" "}
            <Link to="/painel/configuracoes/horarios" className="font-semibold underline">
              Horários de funcionamento
            </Link>
            .
          </p>
        </GestaoCard>

        <GestaoCard>
          <GestaoSectionTitle
            title="Operacao da loja"
            description="Pedido minimo, taxa padrao, fidelidade e abertura manual da loja."
            action={<Settings2 className="size-5 shrink-0 text-sage" />}
          />

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <GestaoField label="Pedido mínimo (R$)">
              <GestaoInput
                type="number"
                step="0.01"
                value={activeConfig.pedido_minimo}
                onChange={(e) =>
                  setConfig({ ...activeConfig, pedido_minimo: Number(e.target.value) })
                }
              />
            </GestaoField>
            <GestaoField label="Taxa padrão de entrega (R$)">
              <GestaoInput
                type="number"
                step="0.01"
                value={activeConfig.valor_padrao_entrega}
                onChange={(e) =>
                  setConfig({ ...activeConfig, valor_padrao_entrega: Number(e.target.value) })
                }
              />
            </GestaoField>
            <GestaoField label="Pontos de fidelidade por R$ 1">
              <GestaoInput
                type="number"
                step="0.1"
                value={activeConfig.pontos_por_real}
                onChange={(e) =>
                  setConfig({ ...activeConfig, pontos_por_real: Number(e.target.value) })
                }
              />
            </GestaoField>
          </div>

          <GestaoButton className="mt-4" onClick={() => saveConfigMutation.mutate(activeConfig)}>
            <Save className="size-4" />
            Salvar configuração
          </GestaoButton>
        </GestaoCard>

        <GestaoCard>
          <GestaoSectionTitle
            title="Bairros de entrega"
            description="Taxas e areas atendidas no delivery."
            action={<MapPinned className="size-5 shrink-0 text-gold" />}
          />

          <GestaoToolbar className="mt-4">
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

          <GestaoTable className="mt-4">
            <GestaoTableHead>
              <tr>
                <th className="p-3">Bairro</th>
                <th className="p-3">Taxa</th>
                <th className="p-3 hidden sm:table-cell">Status</th>
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
        </GestaoCard>
      </div>
    </GestaoPage>
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
    <tr className="border-t border-[color:var(--honey-line)]">
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
        <label className="inline-flex items-center gap-2">
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
