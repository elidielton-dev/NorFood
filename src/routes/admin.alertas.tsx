import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { AdminCard, AdminPage } from "@/routes/admin";
import { getAdminDashboardServer } from "@/lib/api/platform-admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/alertas")({
  component: AdminAlertasPage,
});

function AdminAlertasPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => getAdminDashboardServer(),
  });

  return (
    <AdminPage title="Alertas" subtitle="Pendências operacionais que exigem atenção da equipe NorFood.">
      {isLoading ? (
        <p className="text-sm text-[#6B7280]">Carregando...</p>
      ) : (data?.alerts.length ?? 0) === 0 ? (
        <AdminCard>
          <p className="py-8 text-center text-sm text-[#6B7280]">Nenhum alerta no momento. Plataforma saudável.</p>
        </AdminCard>
      ) : (
        <ul className="space-y-3">
          {data?.alerts.map((alert) => (
            <li key={alert.id}>
              <Link
                to={alert.href ?? "/admin"}
                className={cn(
                  "flex items-start gap-4 rounded-2xl border p-5 transition hover:shadow-sm",
                  alert.level === "critical" && "border-rose-200 bg-rose-50",
                  alert.level === "warning" && "border-amber-200 bg-amber-50",
                  alert.level === "info" && "border-[#E5E7EB] bg-white",
                )}
              >
                <AlertTriangle
                  className={cn(
                    "size-5 shrink-0",
                    alert.level === "critical" && "text-rose-600",
                    alert.level === "warning" && "text-amber-600",
                    alert.level === "info" && "text-[#FF9100]",
                  )}
                />
                <div>
                  <p className="font-semibold text-[#111111]">{alert.title}</p>
                  <p className="mt-1 text-sm text-[#6B7280]">{alert.description}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
