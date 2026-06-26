import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  GestaoButton,
  GestaoField,
  GestaoInput,
  GestaoModalFooter,
  gestao,
} from "@/components/gestao-ui";
import { STAFF_ROLE_OPTIONS, type ColaboradorFormState, type StaffRole } from "@/lib/colaboradores";
import { cn } from "@/lib/utils";

type ColaboradorFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ColaboradorFormState;
  setForm: React.Dispatch<React.SetStateAction<ColaboradorFormState>>;
  saving?: boolean;
  onSave: () => void;
};

export function ColaboradorFormModal({
  open,
  onOpenChange,
  form,
  setForm,
  saving = false,
  onSave,
}: ColaboradorFormModalProps) {
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(form.id);

  useEffect(() => {
    if (open) setError(null);
  }, [open, form.id]);

  function patchForm(patch: Partial<ColaboradorFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function toggleRole(role: StaffRole) {
    setForm((current) => {
      const checked = current.roles.includes(role);
      const roles = checked
        ? current.roles.filter((item) => item !== role)
        : [...current.roles, role];
      return { ...current, roles };
    });
  }

  function handleSave() {
    if (!form.nome.trim()) {
      setError("Informe o nome do colaborador.");
      return;
    }
    if (!form.email.trim()) {
      setError("Informe o e-mail.");
      return;
    }
    if (!form.telefone.trim()) {
      setError("Informe o telefone.");
      return;
    }
    if (!form.roles.length) {
      setError("Selecione pelo menos um papel.");
      return;
    }
    if (!isEditing && !form.password.trim()) {
      setError("Informe uma senha inicial.");
      return;
    }
    setError(null);
    onSave();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,760px)] w-[calc(100vw-1rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-2xl border-[color:var(--honey-line)] p-0 sm:w-full">
        <DialogHeader className="shrink-0 border-b border-[color:var(--honey-line)] px-4 py-4 sm:px-6">
          <DialogTitle className="font-display text-xl text-[color:var(--gestao-ink)] sm:text-2xl">
            {isEditing ? "Editar colaborador" : "Novo colaborador"}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-4">
            <GestaoField label="Nome completo">
              <GestaoInput
                value={form.nome}
                onChange={(event) => patchForm({ nome: event.target.value })}
                placeholder="Ex.: Maria Silva"
                autoFocus
              />
            </GestaoField>

            <GestaoField label="E-mail">
              <GestaoInput
                type="email"
                value={form.email}
                onChange={(event) => patchForm({ email: event.target.value })}
                placeholder="nome@empresa.com"
                readOnly={isEditing}
                className={isEditing ? "bg-muted/60" : undefined}
              />
            </GestaoField>

            <GestaoField label="Telefone">
              <GestaoInput
                value={form.telefone}
                onChange={(event) => patchForm({ telefone: event.target.value })}
                placeholder="(81) 99999-9999"
              />
            </GestaoField>

            <GestaoField label={isEditing ? "Nova senha" : "Senha inicial"}>
              <GestaoInput
                type="password"
                value={form.password}
                onChange={(event) => patchForm({ password: event.target.value })}
                placeholder={isEditing ? "Opcional" : "Senha de acesso"}
                autoComplete="new-password"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {isEditing
                  ? "Deixe em branco para manter a senha atual."
                  : "Minimo de 6 caracteres com letras e numeros."}
              </p>
            </GestaoField>

            <GestaoField label="Papeis de acesso">
              <div className="space-y-2">
                {STAFF_ROLE_OPTIONS.map((option) => {
                  const checked = form.roles.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition",
                        checked
                          ? "border-sage bg-sage/5"
                          : "border-[color:var(--honey-line)] bg-background hover:bg-muted/40",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRole(option.value)}
                        className="mt-1 size-4 accent-sage"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[color:var(--gestao-ink)]">
                          {option.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">{option.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </GestaoField>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        </div>

        <GestaoModalFooter>
          <p className="text-xs text-muted-foreground">
            {isEditing
              ? "Alteracoes de papel entram em vigor no proximo acesso."
              : "O colaborador recebera acesso ao painel com a senha definida."}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <GestaoButton variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </GestaoButton>
            <GestaoButton onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : isEditing ? "Salvar alteracoes" : "Criar colaborador"}
            </GestaoButton>
          </div>
        </GestaoModalFooter>
      </DialogContent>
    </Dialog>
  );
}
