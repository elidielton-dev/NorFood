import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminCard, AdminPage, AdminStatCard } from "@/routes/admin";
import { generateResellerInvoices } from "@/lib/platform-admin/billing-client";
import { fetchResellersAdmin } from "@/lib/reseller/client";

export const Route = createFileRoute("/admin/faturamento/revendedoras")({
  component: AdminFaturamentoRevendedorasPage,
});

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function AdminFaturamentoRevendedorasPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: resellers = [] } = useQuery({
    queryKey: ["admin-resellers"],
    queryFn: fetchResellersAdmin,
  });

  const generateMutation = useMutation({
    mutationFn: () => generateResellerInvoices(year, month),
    onSuccess: (result) => {
      toast.success(`${result.created} fatura(s) de revendedoras processadas.`);
      void qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const active = resellers.filter((r) => r.status === "active").length;

  return (
    <AdminPage
      title="Faturas de revendedoras"
      subtitle="Cobrança NorFood → hiperadores por licenças ativas."
      actions={
        <button
          type="button"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="rounded-xl bg-[#111111] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {generateMutation.isPending ? "Gerando..." : "Gerar faturas do mês"}
        </button>
      }
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <select className="rounded-lg border px-3 py-2 text-sm" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select className="rounded-lg border px-3 py-2 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <AdminStatCard label="Revendedoras" value={resellers.length} />
        <AdminStatCard label="Ativas" value={active} />
        <AdminStatCard label="Restaurantes na rede" value={resellers.reduce((a, r) => a + (r.tenant_count ?? 0), 0)} />
      </div>

      <AdminCard title="Como funciona">
        <p className="text-sm text-[#6B7280]">
          Ao gerar faturas, o sistema calcula com base em licenças ativas/trial de cada revendedora
          (taxa fixa ou preço por tenant). Revendedoras visualizam o histórico em{" "}
          <strong>/parceiro/financeiro</strong>.
        </p>
      </AdminCard>
    </AdminPage>
  );
}
