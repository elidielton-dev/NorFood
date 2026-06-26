import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
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
import { GestaoButton } from "@/components/gestao-ui";
import { cn } from "@/lib/utils";
import {
  deleteWabaContactServer,
  fetchWabaContactsServer,
  openAtendimentoConversationServer,
  upsertWabaContactServer,
} from "@/lib/api/atendimento.functions";
import type { WabaContact, WabaConversation } from "@/lib/waba/types";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";
import {
  AtendimentoPageHeader,
  AtendimentoSearchInput,
  atendimento,
} from "@/components/atendimento/atendimento-ui";

const PAGE_SIZE = 25;

export function AtendimentoContatos() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<WabaContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WabaContact | null>(null);
  const [openingContactId, setOpeningContactId] = useState<string | null>(null);
  const [form, setForm] = useState({ phone: "", name: "", email: "", company: "" });

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["waba-contacts", search],
    queryFn: () => fetchWabaContactsServer({ data: { search } }),
  });

  const totalCount = contacts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageContacts = contacts.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertWabaContactServer({
        data: editContact ? { id: editContact.id, phone: editContact.phone, ...form } : form,
      }),
    onSuccess: (contact) => {
      setForm({ phone: "", name: "", email: "", company: "" });
      setEditContact(null);
      setFormOpen(false);
      qc.invalidateQueries({ queryKey: ["waba-contacts"] });
      void qc.invalidateQueries({ queryKey: ["atendimento-conversations"] });

      const contactDigits = normalizeWhatsAppPhone(contact.phone);
      qc.setQueryData<WabaConversation[]>(["atendimento-conversations"], (prev) => {
        if (!prev) return prev;
        return prev.map((conv) => {
          const convDigits = normalizeWhatsAppPhone(conv.contact?.phone ?? "");
          const matches =
            conv.contact_id === contact.id ||
            Boolean(contactDigits && convDigits && contactDigits === convDigits);
          if (!matches || !conv.contact) return conv;
          return {
            ...conv,
            contact: {
              ...conv.contact,
              name: contact.name,
              email: contact.email ?? conv.contact.email,
              company: contact.company ?? conv.contact.company,
            },
          };
        });
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWabaContactServer({ data: { id } }),
    onSuccess: () => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["waba-contacts"] });
    },
  });

  function openAdd() {
    setEditContact(null);
    setForm({ phone: "", name: "", email: "", company: "" });
    setFormOpen(true);
  }

  function openEdit(contact: WabaContact) {
    setEditContact(contact);
    setForm({
      phone: contact.phone,
      name: contact.name ?? "",
      email: contact.email ?? "",
      company: contact.company ?? "",
    });
    setFormOpen(true);
  }

  async function openConversation(contact: WabaContact) {
    if (!contact.phone?.trim()) return;
    setOpeningContactId(contact.id);
    try {
      const { conversationId } = await openAtendimentoConversationServer({
        data: {
          contactId: contact.id,
          phone: contact.phone,
          name: contact.name,
        },
      });
      await qc.invalidateQueries({ queryKey: ["atendimento-conversations"] });
      await navigate({
        to: "/painel/atendimento/conversas",
        search: { c: conversationId },
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Nao foi possivel abrir a conversa.");
    } finally {
      setOpeningContactId(null);
    }
  }

  return (
    <div className={atendimento.page}>
      <AtendimentoPageHeader
        title="Contatos"
        subtitle={
          totalCount > 0
            ? `Gerencie a agenda do atendimento WhatsApp. ${totalCount} contato${totalCount === 1 ? "" : "s"}.`
            : "Gerencie a agenda do atendimento WhatsApp (API Meta)."
        }
        actions={
          <button type="button" className={atendimento.primaryBtn} onClick={openAdd}>
            <Plus className="size-4" />
            Adicionar contato
          </button>
        }
      />

      <AtendimentoSearchInput
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(0);
        }}
        placeholder="Buscar por nome, telefone ou e-mail..."
      />

      <div className={atendimento.card}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40">
              <th className="p-3 text-left font-medium text-muted-foreground">Nome</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Telefone</th>
              <th className="hidden p-3 text-left font-medium text-muted-foreground md:table-cell">
                E-mail
              </th>
              <th className="hidden p-3 text-left font-medium text-muted-foreground lg:table-cell">
                Empresa
              </th>
              <th className="hidden p-3 text-left font-medium text-muted-foreground lg:table-cell">
                Cadastro
              </th>
              <th className="w-24 p-3 text-right font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-sage" />
                    <p className="text-sm text-muted-foreground">Carregando contatos...</p>
                  </div>
                </td>
              </tr>
            ) : pageContacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground/60" />
                    <p className="text-sm text-muted-foreground">
                      {search ? "Nenhum contato encontrado." : "Nenhum contato ainda."}
                    </p>
                    {!search ? (
                      <button
                        type="button"
                        className={cn(atendimento.outlineBtn, "mt-2 text-xs")}
                        onClick={openAdd}
                      >
                        <Plus className="size-3.5" />
                        Adicionar primeiro contato
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : (
              pageContacts.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-[color:var(--honey-line)] transition hover:bg-[color:var(--gestao-cream)]/40"
                >
                  <td className="p-3 font-medium text-[color:var(--gestao-ink)]">
                    {c.name ?? <span className="italic text-muted-foreground">Sem nome</span>}
                  </td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{c.phone}</td>
                  <td className="hidden p-3 text-muted-foreground md:table-cell">
                    {c.email ?? "—"}
                  </td>
                  <td className="hidden p-3 text-muted-foreground lg:table-cell">
                    {c.company ?? "—"}
                  </td>
                  <td className="hidden p-3 text-xs text-muted-foreground lg:table-cell">
                    {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-sage hover:bg-sage/10 hover:text-sage disabled:opacity-50"
                        aria-label={`Abrir conversa com ${c.name ?? c.phone}`}
                        title="Abrir conversa"
                        disabled={!c.phone?.trim() || openingContactId === c.id}
                        onClick={() => void openConversation(c)}
                      >
                        {openingContactId === c.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <MessageSquare className="size-4" />
                        )}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Ações"
                          >
                            <MoreHorizontal className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(c)}>
                            <Pencil className="size-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(c)}
                          >
                            <Trash2 className="size-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} de{" "}
            {totalCount}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={cn(atendimento.outlineBtn, "size-8 p-0")}
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-2 text-xs text-muted-foreground">
              Página {page + 1} de {totalPages}
            </span>
            <button
              type="button"
              className={cn(atendimento.outlineBtn, "size-8 p-0")}
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editContact ? "Editar contato" : "Novo contato"}</DialogTitle>
            <DialogDescription>
              {editContact
                ? "Atualize os dados do contato. O telefone não pode ser alterado."
                : "Cadastre um contato com telefone no formato E.164 (ex: 5587999999999)."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className={atendimento.label}>Telefone</label>
              <input
                className={cn(atendimento.input, "mt-1")}
                placeholder="5587999999999"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                disabled={!!editContact}
              />
            </div>
            <div>
              <label className={atendimento.label}>Nome</label>
              <input
                className={cn(atendimento.input, "mt-1")}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className={atendimento.label}>E-mail</label>
              <input
                className={cn(atendimento.input, "mt-1")}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className={atendimento.label}>Empresa</label>
              <input
                className={cn(atendimento.input, "mt-1")}
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <GestaoButton variant="secondary" onClick={() => setFormOpen(false)}>
              Cancelar
            </GestaoButton>
            <GestaoButton
              onClick={() => saveMutation.mutate()}
              disabled={!form.phone.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Salvar
            </GestaoButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir contato</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name || deleteTarget?.phone}
              </span>
              ? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <GestaoButton variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </GestaoButton>
            <GestaoButton
              variant="danger"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
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
