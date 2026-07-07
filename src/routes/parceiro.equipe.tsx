import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shield, UserCircle } from "lucide-react";
import { ParceiroDataTable, type ParceiroTableColumn } from "@/components/parceiro/parceiro-data-table";
import { ParceiroCard, ParceiroPage } from "@/routes/parceiro";
import { fetchResellerTeam } from "@/lib/reseller/client";
import type { ResellerTeamMember } from "@/lib/api/plataforma/platform-reseller.functions";

export const Route = createFileRoute("/parceiro/equipe")({
  component: ParceiroEquipePage,
});

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietario",
  admin: "Administrador",
  support: "Suporte",
};

function ParceiroEquipePage() {
  const { data: team = [], isLoading } = useQuery({
    queryKey: ["reseller-team"],
    queryFn: fetchResellerTeam,
  });

  const columns: ParceiroTableColumn<ResellerTeamMember>[] = [
    {
      id: "user",
      header: "Usuario",
      sortable: true,
      sortValue: (m) => m.name ?? m.email ?? "",
      cell: (m) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-[#111111] text-xs font-semibold text-white">
            {(m.name ?? m.email ?? "?").charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-primary">{m.name ?? "—"}</p>
            <p className="text-xs text-[#6B7280]">{m.email ?? m.user_id}</p>
          </div>
        </div>
      ),
    },
    {
      id: "role",
      header: "Papel",
      sortable: true,
      sortValue: (m) => m.role,
      cell: (m) => (
        <span className="inline-flex items-center gap-1 capitalize">
          {m.role === "owner" ? (
            <Shield className="size-3.5 text-primary" />
          ) : (
            <UserCircle className="size-3.5 text-[#6B7280]" />
          )}
          {ROLE_LABELS[m.role] ?? m.role}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      sortValue: (m) => m.status,
      cell: (m) => <span className="capitalize">{m.status}</span>,
    },
    {
      id: "since",
      header: "Desde",
      sortable: true,
      sortValue: (m) => m.created_at,
      cell: (m) => new Date(m.created_at).toLocaleDateString("pt-BR"),
    },
  ];

  return (
    <ParceiroPage
      title="Equipe"
      subtitle="Usuarios com acesso ao portal parceiro NorFood."
      actions={
        <span className="rounded-full bg-[#F6F7F9] px-3 py-1.5 text-xs font-medium text-[#6B7280]">
          Convites em breve
        </span>
      }
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Membros" value={String(team.length)} />
        <Stat label="Ativos" value={String(team.filter((m) => m.status === "active").length)} />
        <Stat
          label="Administradores"
          value={String(team.filter((m) => m.role === "owner" || m.role === "admin").length)}
        />
      </div>

      <ParceiroDataTable
        columns={columns}
        data={team}
        rowKey={(m) => m.id}
        isLoading={isLoading}
        searchPlaceholder="Pesquisa rapida..."
        searchMatch={(m, q) =>
          `${m.name ?? ""} ${m.email ?? ""} ${m.role}`.toLowerCase().includes(q)
        }
        emptyMessage="Nenhum membro encontrado."
      />

      <ParceiroCard title="Permissoes por papel" className="mt-6">
        <ul className="grid gap-2 text-sm text-[#6B7280] sm:grid-cols-3">
          <li>
            <strong className="text-[#111111]">Owner</strong> — acesso total, financeiro e configuracoes
          </li>
          <li>
            <strong className="text-[#111111]">Admin</strong> — restaurantes, tokens e relatorios
          </li>
          <li>
            <strong className="text-[#111111]">Suporte</strong> — visualizacao e ajuda a clientes
          </li>
        </ul>
      </ParceiroCard>
    </ParceiroPage>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E8EAED] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#111111]">{value}</p>
    </div>
  );
}
