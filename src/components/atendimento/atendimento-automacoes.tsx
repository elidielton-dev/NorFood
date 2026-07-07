import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Clock,
  Loader2,
  MessageCircle,
  MoreVertical,
  PhoneCall,
  Plus,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { GestaoButton } from "@/components/painel/gestao-ui";
import { cn } from "@/lib/shared/utils";
import {
  createWabaAutomationServer,
  deleteWabaAutomationServer,
  fetchWabaAutomationServer,
  fetchWabaAutomationsServer,
  setWabaAutomationActiveServer,
  updateWabaAutomationServer,
} from "@/lib/api/atendimento/waba.functions";
import { fetchWabaAutomationLogsServer } from "@/lib/api/atendimento/atendimento.functions";
import type { WabaAutomation } from "@/lib/waba/types";
import { WABA_TRIGGER_LABELS_PT } from "@/lib/waba/types";
import {
  AtendimentoPageHeader,
  atendimento,
  formatRelativePt,
} from "@/components/atendimento/atendimento-ui";

const TRIGGERS = [
  { value: "new_message_received", label: "Nova mensagem recebida", icon: MessageCircle },
  { value: "first_inbound_message", label: "Primeira mensagem do contato", icon: PhoneCall },
  { value: "new_contact_created", label: "Novo contato criado", icon: Users },
  { value: "outside_store_hours", label: "Fora do horario da loja", icon: Clock },
  { value: "inside_store_hours", label: "Dentro do horario da loja", icon: Clock },
  { value: "keyword_match", label: "Palavra-chave na mensagem", icon: Zap },
] as const;

const TEMPLATES = [
  {
    trigger: "first_inbound_message" as const,
    name: "Boas-vindas",
    description: "Responde na primeira mensagem do contato (uma vez por cliente).",
    icon: MessageCircle,
    reply:
      "Olá! Obrigado por entrar em contato com a Abelha & Mel. Em breve um atendente irá responder.",
  },
  {
    trigger: "first_inbound_message" as const,
    name: "Primeiro contato",
    description: "Mensagem na primeira vez que o cliente escreve.",
    icon: Users,
    reply: "Seja bem-vindo à Abelha & Mel! Como podemos ajudar você hoje?",
  },
  {
    trigger: "outside_store_hours" as const,
    name: "Fora do horário",
    description: "Dispara automaticamente quando a loja está fechada.",
    icon: Clock,
    reply:
      "Recebemos sua mensagem! Nosso horário de atendimento é de segunda a sábado, das 8h às 18h. Retornaremos em breve.",
  },
];

export function AtendimentoAutomacoes() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<WabaAutomation | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    trigger_type: "new_message_received",
    reply_text: "",
    keyword: "",
  });

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ["waba-automations"],
    queryFn: () => fetchWabaAutomationsServer(),
  });

  const { data: automationLogs = [] } = useQuery({
    queryKey: ["waba-automation-logs"],
    queryFn: () => fetchWabaAutomationLogsServer(),
  });

  const createMutation = useMutation({
    mutationFn: () => createWabaAutomationServer({ data: form }),
    onSuccess: () => {
      resetForm();
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["waba-automations"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateWabaAutomationServer({
        data: {
          id: editingId!,
          name: form.name,
          description: form.description,
          trigger_type: form.trigger_type,
          reply_text: form.reply_text,
        },
      }),
    onSuccess: () => {
      resetForm();
      setCreateOpen(false);
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["waba-automations"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setWabaAutomationActiveServer({ data: { id, isActive } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["waba-automations"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWabaAutomationServer({ data: { id } }),
    onSuccess: () => {
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["waba-automations"] });
    },
  });

  function resetForm() {
    setForm({
      name: "",
      description: "",
      trigger_type: "new_message_received",
      reply_text: "",
      keyword: "",
    });
  }

  function openCreateDialog() {
    setEditingId(null);
    resetForm();
    setCreateOpen(true);
  }

  async function openEditDialog(automation: WabaAutomation) {
    setLoadingEdit(true);
    try {
      const detail = await fetchWabaAutomationServer({ data: { id: automation.id } });
      setEditingId(automation.id);
      setForm({
        name: detail.name,
        description: detail.description ?? "",
        trigger_type: detail.trigger_type,
        reply_text: detail.reply_text ?? "",
        keyword: detail.keyword ?? "",
      });
      setCreateOpen(true);
    } finally {
      setLoadingEdit(false);
    }
  }

  function applyTemplate(template: (typeof TEMPLATES)[number]) {
    setEditingId(null);
    setForm({
      name: template.name,
      description: template.description,
      trigger_type: template.trigger,
      reply_text: template.reply,
      keyword: "",
    });
    setCreateOpen(true);
  }

  const showTemplates = automations.length < 3;

  return (
    <div className={atendimento.page}>
      <AtendimentoPageHeader
        title="Automações"
        subtitle="Fluxos que reagem a eventos do WhatsApp automaticamente."
        actions={
          <button type="button" className={atendimento.primaryBtn} onClick={openCreateDialog}>
            <Plus className="size-4" />
            Criar automação
          </button>
        }
      />

      {showTemplates ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Modelos rápidos</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {TEMPLATES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className={cn(
                    atendimento.card,
                    atendimento.cardHover,
                    "flex flex-col items-start p-4 text-left",
                  )}
                >
                  <div className={cn(atendimento.iconBoxLg, "mb-3")}>
                    <Icon className="size-5" />
                  </div>
                  <div className="text-sm font-semibold text-[color:var(--gestao-ink)]">
                    {t.name}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-sage" />
        </div>
      ) : automations.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/30">
          <div className={cn(atendimento.iconBoxLg, "size-12")}>
            <Zap className="size-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-[color:var(--gestao-ink)]">
            Nenhuma automação ainda
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Escolha um modelo acima ou crie uma do zero.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              onToggle={(next) => toggleMutation.mutate({ id: a.id, isActive: next })}
              onEdit={() => void openEditDialog(a)}
              onDelete={() => setPendingDelete(a)}
            />
          ))}
        </ul>
      )}

      <section className={cn(atendimento.card, "p-5")}>
        <h2 className="text-sm font-semibold text-[color:var(--gestao-ink)]">Historico recente</h2>
        <p className="mt-1 text-xs text-muted-foreground">Ultimas execucoes de automacao.</p>
        <div className="mt-4 space-y-2">
          {automationLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma execucao registrada ainda.</p>
          ) : (
            automationLogs
              .slice(0, 12)
              .map(
                (log: {
                  id: string;
                  status: string;
                  created_at: string;
                  trigger_event: string;
                  automation?: { name?: string };
                  contact?: { name?: string | null; phone?: string | null };
                }) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--honey-line)] px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-medium text-[color:var(--gestao-ink)]">
                        {log.automation?.name ?? "Automacao"}
                      </p>
                      <p className="text-muted-foreground">
                        {log.contact?.name ?? log.contact?.phone ?? "Contato"} · {log.trigger_event}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={log.status === "success" ? "text-sage" : "text-destructive"}>
                        {log.status === "success" ? "OK" : "Falhou"}
                      </p>
                      <p className="text-muted-foreground">{formatRelativePt(log.created_at)}</p>
                    </div>
                  </div>
                ),
              )
          )}
        </div>
      </section>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setEditingId(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar automação" : "Nova automação"}</DialogTitle>
            <DialogDescription>
              Defina o gatilho e a resposta automática enviada pelo WhatsApp. Respostas repetidas
              para o mesmo contato são limitadas (24h em “nova mensagem”, uma vez nos demais).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className={atendimento.label}>Nome</label>
              <input
                className={cn(atendimento.input, "mt-1")}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className={atendimento.label}>Gatilho</label>
              <select
                className={cn(atendimento.select, "mt-1")}
                value={form.trigger_type}
                onChange={(e) => setForm((f) => ({ ...f, trigger_type: e.target.value }))}
              >
                {TRIGGERS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={atendimento.label}>Descrição (opcional)</label>
              <input
                className={cn(atendimento.input, "mt-1")}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            {form.trigger_type === "keyword_match" ? (
              <div>
                <label className={atendimento.label}>Palavra-chave</label>
                <input
                  className={cn(atendimento.input, "mt-1")}
                  value={form.keyword}
                  onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
                  placeholder="Ex: cardapio, entrega, horario"
                />
              </div>
            ) : null}
            <div>
              <label className={atendimento.label}>Texto da resposta</label>
              <textarea
                className={cn(atendimento.input, "mt-1 min-h-24 py-2")}
                value={form.reply_text}
                onChange={(e) => setForm((f) => ({ ...f, reply_text: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <GestaoButton variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancelar
            </GestaoButton>
            <GestaoButton
              onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
              disabled={
                !form.name.trim() ||
                !form.reply_text.trim() ||
                createMutation.isPending ||
                updateMutation.isPending ||
                loadingEdit
              }
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {editingId ? "Salvar" : "Criar"}
            </GestaoButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir automação</DialogTitle>
            <DialogDescription>
              Isso remove permanentemente{" "}
              <span className="font-medium text-foreground">{pendingDelete?.name}</span>. Não pode
              ser desfeito.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <GestaoButton variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancelar
            </GestaoButton>
            <GestaoButton
              variant="danger"
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Excluir
            </GestaoButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDelete,
}: {
  automation: WabaAutomation;
  onToggle: (next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const triggerLabel = WABA_TRIGGER_LABELS_PT[automation.trigger_type] ?? automation.trigger_type;

  return (
    <li className={cn(atendimento.card, "transition-colors hover:border-sage/20")}>
      <div className="flex items-center gap-4 p-4">
        <div className={atendimento.iconBoxLg} aria-hidden>
          <Zap className="size-5" />
        </div>

        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-[color:var(--gestao-ink)]">
              {automation.name}
            </span>
            {automation.is_active ? (
              <span className="relative flex size-2" aria-label="ativa">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-sage opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-sage" />
              </span>
            ) : null}
          </div>
          {automation.description ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {automation.description}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center rounded-full border border-sage/20 bg-sage/10 px-2 py-0.5 text-[11px] font-medium text-sage">
              {triggerLabel}
            </span>
            <span className="tabular-nums">
              {automation.execution_count} execuç{automation.execution_count === 1 ? "ão" : "ões"}
            </span>
            <span aria-hidden>·</span>
            <span>última {formatRelativePt(automation.last_executed_at)}</span>
          </div>
        </button>

        <div className="flex items-center gap-3">
          <Switch
            checked={automation.is_active}
            onCheckedChange={(v) => onToggle(!!v)}
            aria-label={automation.is_active ? "Desativar" : "Ativar"}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Menu"
              >
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>Editar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}
