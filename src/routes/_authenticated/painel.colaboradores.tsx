import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ColaboradorFormModal } from "@/components/colaborador-form-modal";
import {
  fetchColaboradorServer,
  fetchColaboradoresServer,
  saveColaboradorServer,
} from "@/lib/api/colaboradores.functions";
import {
  colaboradorToFormState,
  createEmptyColaboradorForm,
  formatStaffRoleLabel,
  type ColaboradorFormState,
} from "@/lib/colaboradores";
import {
  GestaoButton,
  GestaoEmptyState,
  GestaoPage,
  GestaoTable,
  GestaoTableHead,
  StatusPill,
} from "@/components/gestao-ui";
import { useTenantId, useTenantSlug } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/painel/colaboradores")({
  component: ColaboradoresPage,
});

function ColaboradoresPage() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  const tenantSlug = useTenantSlug();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ColaboradorFormState>(createEmptyColaboradorForm());
  const [loadingColaboradorId, setLoadingColaboradorId] = useState<string | null>(null);

  const { data: colaboradores = [], isLoading } = useQuery({
    queryKey: ["colaboradores", tenantSlug],
    queryFn: () => fetchColaboradoresServer({ data: tenantSlug }),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: ColaboradorFormState) =>
      saveColaboradorServer({
        data: {
          id: payload.id,
          nome: payload.nome,
          email: payload.email,
          telefone: payload.telefone,
          password: payload.password || undefined,
          roles: payload.roles,
          tenantId,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colaboradores", tenantSlug] });
      toast.success(
        form.id ? "Colaborador atualizado com sucesso." : "Colaborador criado com sucesso.",
      );
      setModalOpen(false);
      setForm(createEmptyColaboradorForm());
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel salvar o colaborador.",
      );
    },
  });

  function handleOpenNew() {
    setForm(createEmptyColaboradorForm());
    setModalOpen(true);
  }

  async function handleOpenEdit(colaboradorId: string) {
    setLoadingColaboradorId(colaboradorId);
    try {
      const colaborador = await fetchColaboradorServer({ data: { id: colaboradorId, tenantSlug } });
      setForm(colaboradorToFormState(colaborador));
      setModalOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel carregar o colaborador.",
      );
    } finally {
      setLoadingColaboradorId(null);
    }
  }

  function handleSave() {
    saveMutation.mutate(form);
  }

  return (
    <>
      <GestaoPage
        title="Colaboradores"
        subtitle="Equipe com acesso ao painel, cozinha e entregas"
        actions={
          <GestaoButton onClick={handleOpenNew}>
            <Plus className="size-4" />
            Novo colaborador
          </GestaoButton>
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando equipe...</p>
        ) : colaboradores.length === 0 ? (
          <GestaoEmptyState
            icon={<UserCog className="size-8" />}
            title="Nenhum colaborador cadastrado"
            description="Cadastre a equipe com acesso ao painel, cozinha, salao ou entregas."
            action={
              <GestaoButton onClick={handleOpenNew}>
                <Plus className="size-4" />
                Novo colaborador
              </GestaoButton>
            }
          />
        ) : (
          <GestaoTable>
            <GestaoTableHead>
              <tr>
                <th className="p-3">Nome</th>
                <th className="hidden p-3 md:table-cell">E-mail</th>
                <th className="hidden p-3 sm:table-cell">Telefone</th>
                <th className="p-3">Papeis</th>
              </tr>
            </GestaoTableHead>
            <tbody>
              {colaboradores.map((colaborador) => {
                const isRowLoading = loadingColaboradorId === colaborador.id;
                return (
                  <tr
                    key={colaborador.id}
                    onClick={() => void handleOpenEdit(colaborador.id)}
                    className={cn(
                      "cursor-pointer border-t border-[color:var(--honey-line)] transition hover:bg-[color:var(--gestao-cream)]/50",
                      isRowLoading && "opacity-60",
                    )}
                  >
                    <td className="p-3 font-medium">{colaborador.nome ?? "Sem nome"}</td>
                    <td className="hidden p-3 md:table-cell">{colaborador.email ?? "—"}</td>
                    <td className="hidden p-3 sm:table-cell">{colaborador.telefone ?? "—"}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {colaborador.roles.map((role) => (
                          <StatusPill key={role} tone="neutral">
                            {formatStaffRoleLabel(role)}
                          </StatusPill>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </GestaoTable>
        )}
      </GestaoPage>

      <ColaboradorFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        form={form}
        setForm={setForm}
        saving={saveMutation.isPending}
        onSave={handleSave}
      />
    </>
  );
}
