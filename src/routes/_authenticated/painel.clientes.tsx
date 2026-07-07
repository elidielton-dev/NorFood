import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarClientes } from "@/lib/shared/db";
import {
  GestaoAlert,
  GestaoEmptyState,
  GestaoPage,
  GestaoTable,
  GestaoTableHead,
} from "@/components/painel/gestao-ui";

export const Route = createFileRoute("/_authenticated/painel/clientes")({
  component: Clientes,
});

/** CRM simples: lista profiles e pontos de fidelidade. */
function Clientes() {
  const { data: clientes = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: listarClientes,
  });

  return (
    <GestaoPage title="Clientes" subtitle="CRM e programa de fidelidade">
      {clientes.length === 0 ? (
        <GestaoEmptyState
          title="Nenhum cliente cadastrado"
          description="Os clientes aparecerão aqui conforme forem se registrando na loja."
        />
      ) : (
        <GestaoTable>
          <GestaoTableHead>
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3 hidden sm:table-cell">Telefone</th>
              <th className="p-3 text-right">Pontos</th>
            </tr>
          </GestaoTableHead>
          <tbody>
            {clientes.map((c: any) => (
              <tr key={c.id} className="border-t border-[color:var(--honey-line)]">
                <td className="p-3">{c.nome || "—"}</td>
                <td className="p-3 hidden sm:table-cell">{c.telefone || "—"}</td>
                <td className="p-3 text-right font-display text-lg text-gold">
                  {c.pontos_fidelidade}
                </td>
              </tr>
            ))}
          </tbody>
        </GestaoTable>
      )}

      <GestaoAlert tone="info">
        💌 <strong>Disparos no WhatsApp:</strong> ative integração com WhatsApp Business para
        campanhas e reativação automática de clientes.
      </GestaoAlert>
    </GestaoPage>
  );
}
