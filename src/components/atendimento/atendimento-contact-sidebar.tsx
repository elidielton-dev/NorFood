import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { GitMerge, Loader2, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { GestaoButton, GestaoInput, gestao } from "@/components/gestao-ui";
import { cn } from "@/lib/utils";
import {
  assignAtendimentoConversationAgentServer,
  fetchAtendimentoContactCrmServer,
  fetchAtendimentoStaffServer,
  fetchContactTagsServer,
  fetchWabaTagsServer,
  mergeAtendimentoDuplicatesServer,
  saveAtendimentoConversationContactServer,
  setContactTagsServer,
} from "@/lib/api/atendimento.functions";
import type { WabaConversation, WabaConversationStatus } from "@/lib/waba/types";
import { ContactAvatar } from "@/components/atendimento/atendimento-ui";

function SidebarField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className={gestao.label}>{label}</p>
      <p className="mt-0.5 text-sm text-[color:var(--gestao-ink)]">{value?.trim() || "—"}</p>
    </div>
  );
}

export function AtendimentoContactSidebar({
  contact,
  conversation,
  onStatusChange,
  statusUpdating,
  onLinkPhone,
  linkingPhone,
  onContactUpdated,
  onConversationMerged,
}: {
  contact: WabaConversation["contact"];
  conversation: WabaConversation;
  onStatusChange: (status: WabaConversationStatus) => void;
  statusUpdating: boolean;
  onLinkPhone: (phone: string) => void;
  linkingPhone: boolean;
  onContactUpdated?: () => void;
  onConversationMerged?: (targetId: string) => void;
}) {
  const [phoneDraft, setPhoneDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
  });
  const queryClient = useQueryClient();

  const { data: crm } = useQuery({
    queryKey: ["atendimento-contact-crm", contact?.phone],
    queryFn: () => fetchAtendimentoContactCrmServer({ data: { phone: contact?.phone ?? null } }),
    enabled: Boolean(contact?.phone?.trim()),
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["atendimento-staff"],
    queryFn: () => fetchAtendimentoStaffServer(),
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ["waba-tags"],
    queryFn: () => fetchWabaTagsServer(),
  });

  const { data: contactTagIds = [] } = useQuery({
    queryKey: ["contact-tags", contact?.id],
    queryFn: () => fetchContactTagsServer({ data: { contactId: contact!.id } }),
    enabled: Boolean(contact?.id),
  });

  const tagsMutation = useMutation({
    mutationFn: (tagIds: string[]) =>
      setContactTagsServer({ data: { contactId: contact!.id, tagIds } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-tags", contact?.id] });
      queryClient.invalidateQueries({ queryKey: ["contact-tags-index"] });
    },
    onError: () => toast.error("Nao foi possivel atualizar as tags."),
  });

  const saveContactMutation = useMutation({
    mutationFn: () => {
      const wabaId =
        conversation.contact_id !== conversation.id ? conversation.contact_id : undefined;
      return saveAtendimentoConversationContactServer({
        data: {
          conversationId: conversation.id,
          contactId: wabaId,
          phone: editForm.phone || contact!.phone || "",
          name: editForm.name,
          email: editForm.email || undefined,
          company: editForm.company || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Contato atualizado.");
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["waba-contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["atendimento-conversations"] });
      onContactUpdated?.();
    },
    onError: () => toast.error("Nao foi possivel salvar o contato."),
  });

  const assignMutation = useMutation({
    mutationFn: (agentUserId: string | null) =>
      assignAtendimentoConversationAgentServer({
        data: { conversationId: conversation.id, agentUserId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["atendimento-conversations"] });
      toast.success("Atendente atualizado.");
    },
    onError: () => toast.error("Nao foi possivel atribuir o atendente."),
  });

  const mergeMutation = useMutation({
    mutationFn: () =>
      mergeAtendimentoDuplicatesServer({ data: { conversationId: conversation.id } }),
    onSuccess: (result) => {
      if (result.merged > 0) {
        toast.success(`${result.merged} conversa(s) unificada(s).`);
        void queryClient.invalidateQueries({ queryKey: ["atendimento-conversations"] });
        onConversationMerged?.(result.targetId);
      } else {
        toast.message("Nenhuma duplicata encontrada para unificar.");
      }
    },
    onError: () => toast.error("Nao foi possivel unificar conversas."),
  });

  const toggleTag = (tagId: string) => {
    if (!contact?.id || tagsMutation.isPending) return;
    const next = contactTagIds.includes(tagId)
      ? contactTagIds.filter((id) => id !== tagId)
      : [...contactTagIds, tagId];
    tagsMutation.mutate(next);
  };

  function startEdit() {
    setEditForm({
      name: contact?.name ?? "",
      phone: contact?.phone ?? "",
      email: contact?.email ?? "",
      company: contact?.company ?? "",
    });
    setEditing(true);
  }

  if (!contact) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Informações do contato indisponíveis.</div>
    );
  }

  const missingPhone = !contact.phone?.trim();
  const isAgendaContact = conversation.contact_id !== conversation.id;

  return (
    <div className="flex flex-col gap-6 p-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <ContactAvatar
          name={contact.name ?? contact.phone}
          imageUrl={contact.avatar_url}
          size="md"
        />
        <div>
          <p className="font-display text-lg text-[color:var(--gestao-ink)]">
            {contact.name ?? "Sem nome"}
          </p>
          <p className="text-sm text-muted-foreground">
            {contact.phone?.trim() || "Telefone nao identificado"}
          </p>
        </div>
        <GestaoButton type="button" variant="secondary" size="sm" onClick={startEdit}>
          <Pencil className="mr-1.5 size-3.5" />
          Editar contato
        </GestaoButton>
      </div>

      {editing ? (
        <div className="space-y-3 rounded-xl border border-[color:var(--honey-line)] bg-card p-4">
          <GestaoInput
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nome"
          />
          <GestaoInput
            value={editForm.phone}
            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="Telefone com DDD"
          />
          <GestaoInput
            value={editForm.email}
            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="E-mail"
          />
          <GestaoInput
            value={editForm.company}
            onChange={(e) => setEditForm((f) => ({ ...f, company: e.target.value }))}
            placeholder="Empresa"
          />
          <div className="flex gap-2">
            <GestaoButton
              type="button"
              className="flex-1"
              disabled={saveContactMutation.isPending}
              onClick={() => saveContactMutation.mutate()}
            >
              {saveContactMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Save className="mr-1.5 size-3.5" />
                  Salvar
                </>
              )}
            </GestaoButton>
            <GestaoButton type="button" variant="outline" onClick={() => setEditing(false)}>
              Cancelar
            </GestaoButton>
          </div>
        </div>
      ) : null}

      {missingPhone ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
          <p className="text-sm font-medium text-amber-950">Cadastrar telefone real</p>
          <p className="mt-1 text-xs text-amber-900/80">
            Sem telefone confirmado, mensagens nao podem ser enviadas. Informe o numero com DDD.
          </p>
          <GestaoInput
            value={phoneDraft}
            onChange={(e) => setPhoneDraft(e.target.value)}
            placeholder="5587999999999"
            className="mt-3"
            disabled={linkingPhone}
          />
          <GestaoButton
            type="button"
            className="mt-2 w-full"
            disabled={linkingPhone || phoneDraft.replace(/\D/g, "").length < 10}
            onClick={() => onLinkPhone(phoneDraft.trim())}
          >
            {linkingPhone ? "Salvando..." : "Salvar na agenda"}
          </GestaoButton>
        </div>
      ) : null}

      <div className="space-y-4 border-t border-[color:var(--honey-line)] pt-4">
        <div>
          <p className={gestao.label}>Atendente responsavel</p>
          <select
            className="mt-1 w-full rounded-lg border border-[color:var(--honey-line)] bg-white px-3 py-2 text-sm"
            value={conversation.assigned_agent_id ?? ""}
            disabled={assignMutation.isPending}
            onChange={(event) => {
              const value = event.target.value;
              assignMutation.mutate(value || null);
            }}
          >
            <option value="">Nenhum</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.nome ?? member.email ?? member.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>

        <GestaoButton
          type="button"
          variant="secondary"
          className="w-full"
          disabled={mergeMutation.isPending}
          onClick={() => mergeMutation.mutate()}
        >
          {mergeMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <GitMerge className="mr-1.5 size-4" />
              Unificar duplicatas
            </>
          )}
        </GestaoButton>

        {crm?.clienteId ? (
          <div className="rounded-xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40 p-4">
            <p className={gestao.label}>Cliente cadastrado</p>
            <p className="mt-1 text-sm font-medium text-[color:var(--gestao-ink)]">
              {crm.nome ?? "Cliente"}
            </p>
            {crm.pontos != null ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {crm.pontos} pontos de fidelidade
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {crm.totalPedidos} pedido(s) no sistema
            </p>
            {crm.pedidosRecentes.length > 0 ? (
              <div className="mt-3 space-y-2">
                {crm.pedidosRecentes.map((pedido) => (
                  <div key={pedido.id} className="rounded-lg bg-white px-3 py-2 text-xs">
                    <p className="font-medium text-[color:var(--gestao-ink)]">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(pedido.total)}
                    </p>
                    <p className="text-muted-foreground">
                      {pedido.status} · {new Date(pedido.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <Link
              to="/painel/relatorios/crm"
              className="mt-3 inline-block text-xs font-medium text-sage underline"
            >
              Ver relatorio CRM
            </Link>
          </div>
        ) : null}

        {allTags.length > 0 ? (
          <div>
            <p className={gestao.label}>Tags</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Clique para ativar ou remover
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {allTags.map((tag) => {
                const active = contactTagIds.includes(tag.id as string);
                return (
                  <button
                    key={tag.id as string}
                    type="button"
                    disabled={tagsMutation.isPending || !isAgendaContact}
                    onClick={() => toggleTag(tag.id as string)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] transition-colors",
                      active
                        ? "bg-sage/15 text-sage ring-1 ring-sage/30"
                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                    )}
                    style={active ? { borderColor: tag.color as string } : undefined}
                  >
                    {tag.name as string}
                  </button>
                );
              })}
            </div>
            {!isAgendaContact ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Vincule um telefone para usar tags na agenda.
              </p>
            ) : null}
          </div>
        ) : null}

        {!editing ? (
          <>
            <SidebarField label="E-mail" value={contact.email} />
            <SidebarField label="Empresa" value={contact.company} />
          </>
        ) : null}

        <div>
          <p className={gestao.label}>Status</p>
          <select
            className="mt-1 w-full rounded-lg border border-[color:var(--honey-line)] bg-white px-3 py-2 text-sm"
            value={conversation.status}
            disabled={statusUpdating}
            onChange={(event) => onStatusChange(event.target.value as WabaConversationStatus)}
          >
            <option value="open">Aberta</option>
            <option value="pending">Pendente</option>
            <option value="closed">Resolvida</option>
          </select>
        </div>
        <SidebarField
          label="Cadastro"
          value={new Date(contact.created_at).toLocaleDateString("pt-BR")}
        />
      </div>
    </div>
  );
}
