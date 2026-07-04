import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { ParceiroDataTable, type ParceiroTableColumn } from "@/components/parceiro/parceiro-data-table";
import { ParceiroPage } from "@/routes/parceiro";
import { fetchResellerPendencias } from "@/lib/reseller/client";
import type { ResellerPendenciaRow } from "@/lib/api/platform-reseller.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/parceiro/pendencias")({
  component: ParceiroPendenciasPage,
});

const TYPE_LABELS: Record<string, string> = {
  trial_expiring: "Trial expirando",
  suspended: "Suspenso",
  token_expiring: "Token expirando",
  invoice_open: "Fatura",
  billing_overdue: "Pagamento",
};

function ParceiroPendenciasPage() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["reseller-pendencias"],
    queryFn: fetchResellerPendencias,
    staleTime: 30_000,
  });

  const columns: ParceiroTableColumn<ResellerPendenciaRow>[] = [
    {
      id: "type",
      header: "Tipo",
      sortable: true,
      sortValue: (r) => r.type,
      cell: (r) => (
        <span className="text-xs font-semibold uppercase text-[#6B7280]">
          {TYPE_LABELS[r.type] ?? r.type}
        </span>
      ),
    },
    {
      id: "title",
      header: "Item",
      sortable: true,
      sortValue: (r) => r.title,
      cell: (r) => (
        <div>
          <p className="font-semibold text-primary">{r.title}</p>
          <p className="text-xs text-[#6B7280]">{r.subtitle}</p>
        </div>
      ),
    },
    {
      id: "date",
      header: "Data",
      sortable: true,
      sortValue: (r) => r.date ?? "",
      cell: (r) =>
        r.date ? new Date(r.date).toLocaleDateString("pt-BR") : "—",
    },
    {
      id: "severity",
      header: "Prioridade",
      sortable: true,
      sortValue: (r) => r.severity,
      cell: (r) => (
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
            r.severity === "critical" && "bg-rose-100 text-rose-800",
            r.severity === "warning" && "bg-amber-100 text-amber-800",
            r.severity === "info" && "bg-sky-100 text-sky-800",
          )}
        >
          {r.severity === "critical" ? "Urgente" : r.severity === "warning" ? "Atencao" : "Info"}
        </span>
      ),
    },
    {
      id: "action",
      header: "",
      className: "text-right",
      cell: (r) =>
        r.href ? (
          <Link
            to={r.href}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" />
            Ver
          </Link>
        ) : null,
    },
  ];

  return (
    <ParceiroPage
      title="Pendencias"
      subtitle="Atenção para trials, suspensos, tokens e faturas que precisam de ação nos próximos dias."
    >
      {items.length > 0 ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            Você tem <strong>{items.length}</strong> pendência{items.length !== 1 ? "s" : ""} na carteira.
            Resolva as urgentes primeiro.
          </p>
        </div>
      ) : null}

      <ParceiroDataTable
        columns={columns}
        data={items}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        searchPlaceholder="Pesquisa rapida..."
        searchMatch={(r, q) =>
          `${r.title} ${r.subtitle} ${r.type}`.toLowerCase().includes(q)
        }
        filters={[
          {
            id: "severity",
            label: "Prioridade",
            options: [
              { value: "critical", label: "Urgente" },
              { value: "warning", label: "Atencao" },
              { value: "info", label: "Info" },
            ],
            match: (r, v) => r.severity === v,
          },
        ]}
        emptyMessage="Nenhuma pendencia no momento. Otimo trabalho!"
      />
    </ParceiroPage>
  );
}
