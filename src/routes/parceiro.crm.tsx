import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ParceiroDataTable, type ParceiroTableColumn } from "@/components/parceiro/parceiro-data-table";
import { ParceiroCard, ParceiroPage } from "@/routes/parceiro";
import {
  createResellerLead,
  fetchResellerLeadStats,
  fetchResellerLeads,
  updateResellerLeadStatus,
} from "@/lib/reseller/client";
import type { ResellerLeadRow, ResellerLeadStatus } from "@/lib/api/plataforma/platform-reseller.functions";
import { cn } from "@/lib/shared/utils";

export const Route = createFileRoute("/parceiro/crm")({
  component: ParceiroCrmPage,
});

const STATUS_LABELS: Record<ResellerLeadStatus, string> = {
  novo: "Novo",
  contato: "Em contato",
  demo: "Demo agendada",
  proposta: "Proposta",
  ganho: "Ganho",
  perdido: "Perdido",
};

const STATUS_OPTIONS: ResellerLeadStatus[] = [
  "novo",
  "contato",
  "demo",
  "proposta",
  "ganho",
  "perdido",
];

function ParceiroCrmPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    city: "",
    state: "",
    company_name: "",
    notes: "",
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["reseller-leads"],
    queryFn: fetchResellerLeads,
  });
  const { data: stats } = useQuery({
    queryKey: ["reseller-lead-stats"],
    queryFn: fetchResellerLeadStats,
  });

  const createMutation = useMutation({
    mutationFn: () => createResellerLead(form),
    onSuccess: () => {
      toast.success("Lead registrado.");
      setShowForm(false);
      setForm({ name: "", email: "", phone: "", city: "", state: "", company_name: "", notes: "" });
      void qc.invalidateQueries({ queryKey: ["reseller-leads"] });
      void qc.invalidateQueries({ queryKey: ["reseller-lead-stats"] });
      void qc.invalidateQueries({ queryKey: ["reseller-portal-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { leadId: string; status: ResellerLeadStatus }) =>
      updateResellerLeadStatus(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reseller-leads"] });
      void qc.invalidateQueries({ queryKey: ["reseller-lead-stats"] });
      void qc.invalidateQueries({ queryKey: ["reseller-portal-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: ParceiroTableColumn<ResellerLeadRow>[] = [
    {
      id: "client",
      header: "Cliente",
      sortable: true,
      sortValue: (r) => r.name,
      cell: (r) => (
        <div>
          <p className="font-semibold text-primary">{r.name}</p>
          {r.email ? <p className="text-xs text-[#6B7280]">{r.email}</p> : null}
          {r.phone ? <p className="text-xs text-[#6B7280]">{r.phone}</p> : null}
        </div>
      ),
    },
    {
      id: "city",
      header: "Cidade - UF",
      sortable: true,
      sortValue: (r) => `${r.city ?? ""} ${r.state ?? ""}`,
      cell: (r) =>
        r.city ? `${r.city}${r.state ? ` - ${r.state}` : ""}` : "—",
    },
    {
      id: "created",
      header: "Cadastro",
      sortable: true,
      sortValue: (r) => r.created_at,
      cell: (r) => new Date(r.created_at).toLocaleDateString("pt-BR"),
    },
    {
      id: "status",
      header: "Situacao",
      sortable: true,
      sortValue: (r) => r.status,
      cell: (r) => (
        <select
          className="rounded-lg border border-[#E5E7EB] px-2 py-1 text-xs font-medium"
          value={r.status}
          onChange={(e) =>
            statusMutation.mutate({
              leadId: r.id,
              status: e.target.value as ResellerLeadStatus,
            })
          }
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      ),
    },
  ];

  return (
    <ParceiroPage
      title="CRM"
      subtitle="Pipeline de leads e oportunidades da sua revenda NorFood."
      actions={
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="size-4" />
          Novo lead
        </button>
      }
    >
      <div className="mb-6 grid gap-0 overflow-hidden rounded-xl border border-[#E8EAED] sm:grid-cols-3">
        <FunnelStep label="Leads em aberto" value={stats?.open ?? 0} />
        <FunnelStep label="Ultimos 30 dias" value={stats?.last30Days ?? 0} chevron />
        <FunnelStep label="Oportunidade registrada" value={stats?.opportunities ?? 0} chevron />
      </div>

      {showForm ? (
        <ParceiroCard title="Registrar oportunidade" className="mb-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Field label="E-mail" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
            <Field label="Telefone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
            <Field label="Empresa" value={form.company_name} onChange={(v) => setForm((f) => ({ ...f, company_name: v }))} />
            <Field label="Cidade" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
            <Field label="UF" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} maxLength={2} />
            <label className="sm:col-span-2 text-sm">
              <span className="mb-1 block font-medium">Observacoes</span>
              <textarea
                className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={!form.name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Salvar lead
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Cancelar
            </button>
          </div>
        </ParceiroCard>
      ) : null}

      <ParceiroDataTable
        columns={columns}
        data={leads}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        searchPlaceholder="Pesquisa rapida..."
        searchMatch={(r, q) =>
          `${r.name} ${r.email ?? ""} ${r.phone ?? ""} ${r.city ?? ""}`.toLowerCase().includes(q)
        }
        filters={[
          {
            id: "status",
            label: "Situacao",
            options: STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
            match: (r, v) => r.status === v,
          },
        ]}
        emptyMessage="Nenhum lead cadastrado. Clique em Novo lead para comecar."
      />
    </ParceiroPage>
  );
}

function FunnelStep({
  label,
  value,
  chevron,
}: {
  label: string;
  value: number;
  chevron?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center bg-white px-4 py-6 text-center",
        chevron &&
          "before:absolute before:left-0 before:top-0 before:h-full before:w-3 before:-translate-x-1.5 before:skew-x-[-12deg] before:bg-[#FAFBFC] before:content-['']",
      )}
    >
      <p className="text-3xl font-bold text-primary">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">{label}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
