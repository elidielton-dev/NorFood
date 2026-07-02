import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shield, UserCircle } from "lucide-react";
import { ParceiroCard, ParceiroPage } from "@/routes/parceiro";
import { fetchResellerTeam } from "@/lib/reseller/client";

export const Route = createFileRoute("/parceiro/equipe")({
  component: ParceiroEquipePage,
});

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  support: "Suporte",
};

function ParceiroEquipePage() {
  const { data: team = [], isLoading } = useQuery({
    queryKey: ["reseller-team"],
    queryFn: fetchResellerTeam,
  });

  return (
    <ParceiroPage
      title="Equipe"
      subtitle="Usuários com acesso ao portal do hiperador."
      actions={
        <span className="rounded-full bg-[#F6F7F9] px-3 py-1.5 text-xs font-medium text-[#6B7280]">
          Convites em breve
        </span>
      }
    >
      {isLoading ? (
        <p className="text-sm text-[#6B7280]">Carregando equipe...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Membros" value={String(team.length)} />
            <Stat label="Ativos" value={String(team.filter((m) => m.status === "active").length)} />
            <Stat
              label="Administradores"
              value={String(team.filter((m) => m.role === "owner" || m.role === "admin").length)}
            />
          </div>

          <ParceiroCard title="Membros da revendedora">
            {team.length === 0 ? (
              <p className="text-sm text-[#6B7280]">Nenhum membro encontrado.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[#E5E7EB]">
                <table className="w-full text-sm">
                  <thead className="bg-[#F6F7F9] text-left text-xs uppercase text-[#6B7280]">
                    <tr>
                      <th className="px-4 py-3">Usuário</th>
                      <th className="px-4 py-3">Papel</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Desde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((member) => (
                      <tr key={member.id} className="border-t border-[#E5E7EB]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="grid size-9 place-items-center rounded-full bg-[#111111] text-xs font-semibold text-white">
                              {(member.name ?? member.email ?? "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-[#111111]">{member.name ?? "—"}</p>
                              <p className="text-xs text-[#6B7280]">{member.email ?? member.user_id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 capitalize">
                            {member.role === "owner" ? (
                              <Shield className="size-3.5 text-[#FF9100]" />
                            ) : (
                              <UserCircle className="size-3.5 text-[#6B7280]" />
                            )}
                            {ROLE_LABELS[member.role] ?? member.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 capitalize">{member.status}</td>
                        <td className="px-4 py-3">
                          {new Date(member.created_at).toLocaleDateString("pt-BR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ParceiroCard>

          <ParceiroCard title="Permissões por papel">
            <ul className="grid gap-2 text-sm text-[#6B7280] sm:grid-cols-3">
              <li>
                <strong className="text-[#111111]">Owner</strong> — acesso total, financeiro e configurações
              </li>
              <li>
                <strong className="text-[#111111]">Admin</strong> — restaurantes, tokens e relatórios
              </li>
              <li>
                <strong className="text-[#111111]">Suporte</strong> — visualização e ajuda a clientes
              </li>
            </ul>
          </ParceiroCard>
        </div>
      )}
    </ParceiroPage>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#111111]">{value}</p>
    </div>
  );
}
