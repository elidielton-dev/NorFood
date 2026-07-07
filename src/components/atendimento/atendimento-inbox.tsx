import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Archive,
  Check,
  ChevronDown,
  CornerDownLeft,
  MessageSquare,
  Mic,
  Paperclip,
  RefreshCw,
  Search,
  SendHorizontal,
  Square,
  WifiOff,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { GestaoButton, GestaoInput, gestao } from "@/components/painel/gestao-ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/shared/utils";
import {
  isDirectPlayableMediaUrl,
  normalizeWhatsAppPhone,
  phonesMatchLoosely,
} from "@/lib/atendimento/whatsapp";
import {
  fetchAtendimentoConfigServer,
  fetchContactTagsIndexServer,
  fetchAtendimentoConversationsServer,
  fetchAtendimentoMessageMediaServer,
  fetchAtendimentoMessagesServer,
  fetchWabaTagsServer,
  linkAtendimentoConversationPhoneServer,
  markAtendimentoConversationReadServer,
  sendAtendimentoMediaServer,
  sendAtendimentoMessageServer,
  syncAtendimentoInboxServer,
  updateAtendimentoConversationStatusServer,
} from "@/lib/api/atendimento/atendimento.functions";
import { supabase } from "@/integrations/supabase/client";
import type {
  WabaConversation,
  WabaConversationStatus,
  WabaMessage,
  AtendimentoMessagesPayload,
} from "@/lib/waba/types";
import { ContactAvatar, formatChatTime } from "@/components/atendimento/atendimento-ui";
import { AtendimentoContactSidebar } from "@/components/atendimento/atendimento-contact-sidebar";
import { ZoomableChatImage } from "@/components/atendimento/image-lightbox";
import { EmojiPickerButton } from "@/components/atendimento/emoji-picker-button";
import {
  ATENDIMENTO_OPEN_CONVERSATION_EVENT,
  maybeNotifyInboundMessage,
} from "@/lib/atendimento/notification-settings";
import {
  canJumpToQuotedMessage,
  canQuoteWabaMessage,
  findQuotedTargetMessage,
  wabaMessageReplyPreview,
} from "@/lib/atendimento/message-reply";

type InboxPanel = "conversas" | "resolvidos";
type InboxFilter = "all" | "unread" | "mine" | WabaConversationStatus;

const CONVERSAS_FILTER_OPTIONS: { label: string; value: InboxFilter }[] = [
  { label: "Todas ativas", value: "all" },
  { label: "Minhas conversas", value: "mine" },
  { label: "Não lidas", value: "unread" },
  { label: "Abertas", value: "open" },
  { label: "Pendentes", value: "pending" },
];

const STATUS_DOT: Record<WabaConversationStatus, string> = {
  open: "bg-sage",
  pending: "bg-amber-500",
  closed: "bg-muted-foreground",
};

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? (result.split(",")[1] ?? "") : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

function sortConversationsByRecent(conversations: WabaConversation[]) {
  return [...conversations].sort((a, b) =>
    String(b.last_message_at ?? "").localeCompare(String(a.last_message_at ?? "")),
  );
}

function bumpConversationInList(
  conversations: WabaConversation[],
  conversationId: string,
  preview: string,
  options?: { incrementUnread?: boolean; resetUnread?: boolean; messageAt?: string },
) {
  const now = options?.messageAt ?? new Date().toISOString();
  const index = conversations.findIndex((c) => c.id === conversationId);
  if (index === -1) return conversations;
  const current = conversations[index];
  const bumped: WabaConversation = {
    ...current,
    last_message_text: preview,
    last_message_at: now,
    updated_at: now,
    unread_count: options?.resetUnread
      ? 0
      : options?.incrementUnread
        ? (current.unread_count ?? 0) + 1
        : current.unread_count,
  };
  return sortConversationsByRecent([
    bumped,
    ...conversations.filter((c) => c.id !== conversationId),
  ]);
}

function previewFromWhatsAppMessageRow(row: {
  body?: string | null;
  message_type?: string | null;
}) {
  const body = row.body?.trim();
  if (body) return body;
  const type = String(row.message_type ?? "text");
  if (type === "image" || type === "sticker") return "📷 Imagem";
  if (type === "audio") return "🎤 Áudio";
  if (type === "video") return "🎬 Vídeo";
  if (type === "document") return "📎 Documento";
  return "Mensagem";
}

function wabaContentTypeFromMessageType(
  messageType: string | null | undefined,
): WabaMessage["content_type"] {
  const type = String(messageType ?? "text");
  if (type === "sticker") return "image";
  if (type === "image" || type === "audio" || type === "video" || type === "document") return type;
  return "text";
}

function mergeMessageLists(...lists: WabaMessage[][]): WabaMessage[] {
  const byId = new Map<string, WabaMessage>();
  for (const list of lists) {
    for (const msg of list) {
      const existing = byId.get(msg.id);
      if (!existing || existing.id.startsWith("optimistic-")) {
        byId.set(msg.id, msg);
      }
    }
  }
  const byWaId = new Map<string, WabaMessage>();
  for (const msg of byId.values()) {
    if (msg.wa_message_id) {
      byWaId.set(msg.wa_message_id, msg);
    }
  }
  const deduped = [...byId.values()].filter((msg) => {
    if (!msg.id.startsWith("optimistic-")) return true;
    const body = msg.content_text?.trim() ?? "";
    return ![...byWaId.values()].some(
      (real) =>
        real.sender_type === msg.sender_type &&
        (real.content_text?.trim() ?? "") === body &&
        real.id !== msg.id,
    );
  });
  return deduped.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function emptyMessagesPayload(sessionAt: string | null = null): AtendimentoMessagesPayload {
  return {
    messages: [],
    meta: {
      hasOlderBeforeSession: false,
      hasMoreInSession: false,
      hasMoreInHistory: false,
      sessionAt,
    },
  };
}

function mergeMessagesPayload(
  cached: AtendimentoMessagesPayload,
  fetched: AtendimentoMessagesPayload,
): AtendimentoMessagesPayload {
  return {
    messages: mergeMessageLists(cached.messages, fetched.messages),
    meta: {
      ...fetched.meta,
      hasOlderBeforeSession:
        cached.meta.hasOlderBeforeSession || fetched.meta.hasOlderBeforeSession,
      sessionAt: fetched.meta.sessionAt ?? cached.meta.sessionAt,
    },
  };
}

function patchMessageCache(
  qc: ReturnType<typeof useQueryClient>,
  conversationId: string,
  updater: (prev: AtendimentoMessagesPayload) => AtendimentoMessagesPayload,
) {
  const messageKey = atendimentoMessagesQueryKey(conversationId);
  const prev = qc.getQueryData<AtendimentoMessagesPayload>(messageKey) ?? emptyMessagesPayload();
  qc.setQueryData(messageKey, updater(prev));
}

function conversationsShareContact(
  qc: ReturnType<typeof useQueryClient>,
  idA: string,
  idB: string,
): boolean {
  const conversations = qc.getQueryData<WabaConversation[]>(["atendimento-conversations"]);
  if (!conversations) return false;
  const a = conversations.find((c) => c.id === idA);
  const b = conversations.find((c) => c.id === idB);
  if (!a || !b) return false;
  const phoneA = normalizeWhatsAppPhone(a.contact?.phone ?? "");
  const phoneB = normalizeWhatsAppPhone(b.contact?.phone ?? "");
  if (phoneA && phoneB && phonesMatchLoosely(phoneA, phoneB)) return true;
  const nameA = (a.contact?.name ?? "").trim().toLowerCase();
  const nameB = (b.contact?.name ?? "").trim().toLowerCase();
  return Boolean(nameA && nameA === nameB && nameA.length > 2);
}

function resolveMessageThreadConversationId(
  qc: ReturnType<typeof useQueryClient>,
  messageConversationId: string,
  activeConversationId: string | null,
): { displayConversationId: string; isActiveThread: boolean } {
  if (!activeConversationId) {
    return { displayConversationId: messageConversationId, isActiveThread: false };
  }
  if (messageConversationId === activeConversationId) {
    return { displayConversationId: activeConversationId, isActiveThread: true };
  }
  if (conversationsShareContact(qc, messageConversationId, activeConversationId)) {
    return { displayConversationId: activeConversationId, isActiveThread: true };
  }
  return { displayConversationId: messageConversationId, isActiveThread: false };
}

function appendMessageFromRealtime(
  qc: ReturnType<typeof useQueryClient>,
  cacheConversationId: string | null,
  row: {
    id?: string;
    chat_id?: string;
    body?: string | null;
    message_type?: string | null;
    sent_at?: string;
    direction?: string;
    media_url?: string | null;
    wa_message_id?: string | null;
  },
) {
  if (!cacheConversationId || !row.chat_id) return;

  const messageKey = atendimentoMessagesQueryKey(cacheConversationId);
  const cached = qc.getQueryData<AtendimentoMessagesPayload>(messageKey);
  const prev = cached?.messages;
  if (!prev) {
    void qc.refetchQueries({ queryKey: messageKey, type: "active" });
    return;
  }
  if (row.wa_message_id && prev.some((m) => m.wa_message_id === row.wa_message_id)) return;
  if (row.id && prev.some((m) => m.id === row.id)) return;

  const contentType = wabaContentTypeFromMessageType(row.message_type);
  const incoming: WabaMessage = {
    id: row.id ?? `rt-${Date.now()}`,
    conversation_id: cacheConversationId,
    sender_type: row.direction === "outbound" ? "agent" : "customer",
    sender_id: null,
    content_type: contentType,
    content_text: row.body ?? null,
    media_url: row.media_url ?? null,
    template_name: null,
    wa_message_id: row.wa_message_id ?? null,
    status: row.direction === "outbound" ? "sent" : "delivered",
    created_at: row.sent_at ?? new Date().toISOString(),
  };

  const bodyText = incoming.content_text?.trim() ?? "";
  const optimisticIdx =
    row.direction === "outbound"
      ? prev.findIndex(
          (m) =>
            m.id.startsWith("optimistic-") &&
            m.sender_type === "agent" &&
            (m.content_text?.trim() ?? "") === bodyText,
        )
      : -1;

  if (optimisticIdx >= 0) {
    const next = [...prev];
    next[optimisticIdx] = {
      ...incoming,
      reply_to_wa_message_id:
        prev[optimisticIdx].reply_to_wa_message_id ?? incoming.reply_to_wa_message_id ?? null,
      reply_to_text: prev[optimisticIdx].reply_to_text ?? incoming.reply_to_text ?? null,
      reply_to_from_me: prev[optimisticIdx].reply_to_from_me ?? incoming.reply_to_from_me ?? null,
    };
    setMessagePayloadMessages(qc, messageKey, next);
    return;
  }

  setMessagePayloadMessages(qc, messageKey, [...prev, incoming]);
}

function setMessagePayloadMessages(
  qc: ReturnType<typeof useQueryClient>,
  messageKey: ReturnType<typeof atendimentoMessagesQueryKey>,
  messages: WabaMessage[],
) {
  const cached = qc.getQueryData<AtendimentoMessagesPayload>(messageKey) ?? emptyMessagesPayload();
  qc.setQueryData(messageKey, { ...cached, messages });
}

function appendWabaMessageFromRealtime(
  qc: ReturnType<typeof useQueryClient>,
  cacheConversationId: string | null,
  row: {
    id?: string;
    conversation_id?: string;
    content_text?: string | null;
    content_type?: string | null;
    created_at?: string;
    sender_type?: string;
    media_url?: string | null;
    wa_message_id?: string | null;
    status?: string | null;
    reply_to_wa_message_id?: string | null;
    reply_to_text?: string | null;
    reply_to_from_me?: boolean | null;
  },
) {
  if (!cacheConversationId || !row.conversation_id) return;
  const createdAt = row.created_at ?? new Date().toISOString();

  const messageKey = atendimentoMessagesQueryKey(cacheConversationId);
  const cached = qc.getQueryData<AtendimentoMessagesPayload>(messageKey);
  const prev = cached?.messages;
  if (!prev) {
    void qc.refetchQueries({ queryKey: messageKey, type: "active" });
    return;
  }
  if (row.wa_message_id && prev.some((m) => m.wa_message_id === row.wa_message_id)) return;
  if (row.id && prev.some((m) => m.id === row.id)) return;

  const contentType = (row.content_type ?? "text") as WabaMessage["content_type"];
  const incoming: WabaMessage = {
    id: row.id ?? `rt-${Date.now()}`,
    conversation_id: cacheConversationId,
    sender_type: (row.sender_type ?? "customer") as WabaMessage["sender_type"],
    sender_id: null,
    content_type: contentType,
    content_text: row.content_text ?? null,
    media_url: row.media_url ?? null,
    template_name: null,
    wa_message_id: row.wa_message_id ?? null,
    status: (row.status ?? "delivered") as WabaMessage["status"],
    created_at: createdAt,
    reply_to_wa_message_id: row.reply_to_wa_message_id ?? null,
    reply_to_text: row.reply_to_text ?? null,
    reply_to_from_me: row.reply_to_from_me ?? null,
  };

  const bodyText = incoming.content_text?.trim() ?? "";
  const optimisticIdx =
    incoming.sender_type === "agent"
      ? prev.findIndex(
          (m) =>
            m.id.startsWith("optimistic-") &&
            m.sender_type === "agent" &&
            (m.content_text?.trim() ?? "") === bodyText,
        )
      : -1;

  if (optimisticIdx >= 0) {
    const next = [...prev];
    next[optimisticIdx] = {
      ...incoming,
      reply_to_wa_message_id:
        prev[optimisticIdx].reply_to_wa_message_id ?? incoming.reply_to_wa_message_id ?? null,
      reply_to_text: prev[optimisticIdx].reply_to_text ?? incoming.reply_to_text ?? null,
      reply_to_from_me: prev[optimisticIdx].reply_to_from_me ?? incoming.reply_to_from_me ?? null,
    };
    setMessagePayloadMessages(qc, messageKey, next);
    return;
  }

  setMessagePayloadMessages(qc, messageKey, [...prev, incoming]);
}

function mediaPreviewLabel(mediatype: "image" | "document" | "audio" | "video") {
  if (mediatype === "image") return "📷 Imagem";
  if (mediatype === "audio") return "🎤 Áudio";
  if (mediatype === "video") return "🎬 Vídeo";
  return "📎 Documento";
}

function previewFromWabaMessage(msg: WabaMessage) {
  const text = msg.content_text?.trim();
  if (text) return text;
  if (msg.content_type === "image") return "📷 Imagem";
  if (msg.content_type === "audio") return "🎤 Áudio";
  if (msg.content_type === "video") return "🎬 Vídeo";
  if (msg.content_type === "document") return "📎 Documento";
  return "Mensagem";
}

function atendimentoMessagesQueryKey(conversationId: string) {
  return ["atendimento-messages", conversationId] as const;
}

const SESSION_FILTER_TOLERANCE_MS = 2000;

function filterMessagesForSession(
  messages: WabaMessage[],
  sessionAt: string | null | undefined,
  loadFullHistory: boolean,
) {
  if (loadFullHistory || !sessionAt) return messages;
  const sessionMs = new Date(sessionAt).getTime();
  if (!Number.isFinite(sessionMs)) return messages;
  return messages.filter((message) => {
    const messageMs = new Date(message.created_at).getTime();
    if (!Number.isFinite(messageMs)) return true;
    return messageMs >= sessionMs - SESSION_FILTER_TOLERANCE_MS;
  });
}

/** Evita que um refetch antigo (lento) sobrescreva preview mais novo no cache. */
function mergeConversationLists(cached: WabaConversation[], fetched: WabaConversation[]) {
  const merged = new Map<string, WabaConversation>();
  for (const conv of fetched) {
    merged.set(conv.id, conv);
  }
  for (const conv of cached) {
    const existing = merged.get(conv.id);
    if (!existing) {
      merged.set(conv.id, conv);
      continue;
    }
    const cachedAt = String(conv.last_message_at ?? "");
    const fetchedAt = String(existing.last_message_at ?? "");
    if (cachedAt.localeCompare(fetchedAt) > 0) {
      merged.set(conv.id, {
        ...existing,
        last_message_text: conv.last_message_text ?? existing.last_message_text,
        last_message_at: conv.last_message_at,
        updated_at: conv.updated_at,
      });
    }
    const mergedConv = merged.get(conv.id)!;
    const mergedContact =
      mergedConv.contact && existing.contact
        ? {
            ...mergedConv.contact,
            name: existing.contact.name?.trim() || mergedConv.contact.name,
            email: existing.contact.email ?? mergedConv.contact.email,
            company: existing.contact.company ?? mergedConv.contact.company,
            avatar_url: mergedConv.contact.avatar_url?.trim() ?? null,
          }
        : (mergedConv.contact ?? existing.contact ?? null);
    merged.set(conv.id, {
      ...mergedConv,
      unread_count: Math.max(conv.unread_count ?? 0, mergedConv.unread_count ?? 0),
      contact: mergedContact,
    });
  }
  return sortConversationsByRecent([...merged.values()]);
}

export function AtendimentoInbox({ initialConversationId }: { initialConversationId?: string }) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(initialConversationId ?? null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<InboxPanel>("conversas");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [historyPageLoading, setHistoryPageLoading] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const historyTopSentinelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const prevMessageCountRef = useRef(0);
  const prevFirstMessageIdRef = useRef<string | null>(null);
  const prevActiveIdRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(activeId);
  const scrollToBottomPendingRef = useRef(false);
  /** Mantem scroll no fim ate mensagens renderizarem ao abrir outra conversa. */
  const openConversationScrollIdRef = useRef<string | null>(null);
  const historyExpandedRef = useRef(false);
  const historyLoadPendingRef = useRef(false);
  const scrollHeightBeforeHistoryRef = useRef(0);
  const prevUnreadByChatRef = useRef<Map<string, number>>(new Map());
  const [recording, setRecording] = useState(false);
  const [realtimeOk, setRealtimeOk] = useState(false);
  const [replyTo, setReplyTo] = useState<WabaMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [scrollTick, setScrollTick] = useState(0);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const pendingQuoteRef = useRef<{
    waMessageId: string | null;
    text: string | null;
    fromMe: boolean | null;
    quotingAt: string;
  } | null>(null);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());
  const highlightTimerRef = useRef<number | null>(null);
  const loadFullHistoryRef = useRef(false);
  const sessionAtRef = useRef<string | null>(null);
  const prevSessionAtRef = useRef<string | null>(null);
  /** Sessao reaberta apos encerrar (closed -> open) — exibe "Novo atendimento". */
  const freshAttendanceSessionAtRef = useRef(new Map<string, string>());
  const [focusInputTick, setFocusInputTick] = useState(0);

  activeIdRef.current = activeId;

  const stickActiveChatToBottom = useCallback(() => {
    scrollToBottomPendingRef.current = true;
    historyLoadPendingRef.current = false;
    historyExpandedRef.current = false;
    setHistoryExpanded(false);
    setScrollTick((value) => value + 1);
  }, []);

  const scrollMessagesToBottom = useCallback((el: HTMLElement) => {
    const snap = () => {
      el.scrollTop = el.scrollHeight;
    };
    snap();
    requestAnimationFrame(() => {
      snap();
      requestAnimationFrame(snap);
    });
  }, []);

  const sessionDividerLabel = useCallback((kind: "start" | "boundary") => {
    if (kind === "start") return "Novas mensagens";
    const chatId = activeIdRef.current;
    const at = sessionAtRef.current;
    if (!chatId || !at) return "Novas mensagens";
    const fresh = freshAttendanceSessionAtRef.current.get(chatId);
    if (fresh && fresh === at) return "Novo atendimento";
    return "Novas mensagens";
  }, []);

  const queueFocusMessageInput = useCallback(() => {
    setFocusInputTick((value) => value + 1);
  }, []);

  const prefetchConversationMessages = useCallback(
    (conversationId: string, history = false) => {
      void qc.prefetchQuery({
        queryKey: atendimentoMessagesQueryKey(conversationId),
        queryFn: () =>
          fetchAtendimentoMessagesServer({
            data: { conversationId, history },
          }),
        staleTime: 120_000,
      });
    },
    [qc],
  );

  const { data: config } = useQuery({
    queryKey: ["atendimento-config"],
    queryFn: () => fetchAtendimentoConfigServer(),
    refetchInterval: 120_000,
  });

  const {
    data: conversations = [],
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["atendimento-conversations"],
    queryFn: async () => {
      const fetched = await fetchAtendimentoConversationsServer({ data: { light: true } });
      const cached = qc.getQueryData<WabaConversation[]>(["atendimento-conversations"]);
      return cached?.length ? mergeConversationLists(cached, fetched) : fetched;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    refetchInterval: realtimeOk ? 20_000 : 8_000,
  });

  const inboxCatchUpDoneRef = useRef(false);

  useEffect(() => {
    if (!config?.inbox_connected && !config?.baileys?.connected) return;
    if (inboxCatchUpDoneRef.current) return;
    inboxCatchUpDoneRef.current = true;
    void syncAtendimentoInboxServer().then(() => {
      void refetch();
    });
  }, [config?.inbox_connected, config?.baileys?.connected, refetch]);

  const refreshInbox = useCallback(async () => {
    await syncAtendimentoInboxServer();
    await refetch();
  }, [refetch]);

  const { data: contactTagsIndex = {} } = useQuery({
    queryKey: ["contact-tags-index"],
    queryFn: () => fetchContactTagsIndexServer(),
    staleTime: 60_000,
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ["waba-tags"],
    queryFn: () => fetchWabaTagsServer(),
    staleTime: 120_000,
  });

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchAtendimentoConversationsServer({ data: { full: true } }).then((full) => {
        const cached = qc.getQueryData<WabaConversation[]>(["atendimento-conversations"]);
        qc.setQueryData(
          ["atendimento-conversations"],
          cached?.length ? mergeConversationLists(cached, full) : full,
        );
      });
    }, 300_000);
    return () => window.clearInterval(timer);
  }, [qc]);

  const activeCounts = useMemo(() => {
    const active = conversations.filter((c) => c.status !== "closed");
    const resolved = conversations.filter((c) => c.status === "closed");
    return { active: active.length, resolved: resolved.length };
  }, [conversations]);

  const activeBase = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const resolvedHistoryMode = panel === "resolvidos" || activeBase?.status === "closed";
  const loadFullHistory = resolvedHistoryMode || historyExpanded;

  const {
    data: messagesPayload,
    isLoading: messagesLoading,
    isFetching: messagesFetching,
  } = useQuery({
    queryKey: atendimentoMessagesQueryKey(activeId ?? ""),
    queryFn: async () => {
      const fetched = await fetchAtendimentoMessagesServer({
        data: { conversationId: activeId!, history: loadFullHistory },
      });
      if (!loadFullHistory) return fetched;
      const cached = qc.getQueryData<AtendimentoMessagesPayload>(
        atendimentoMessagesQueryKey(activeId!),
      );
      return cached ? mergeMessagesPayload(cached, fetched) : fetched;
    },
    enabled: !!activeId,
    staleTime: 120_000,
    gcTime: 300_000,
    refetchInterval: realtimeOk ? false : 30_000,
    refetchOnMount: (query) => {
      if (!query.state.data) return true;
      return query.isStale();
    },
  });

  const messages = messagesPayload?.messages ?? [];
  const historyMeta = messagesPayload?.meta;
  const sessionAt = activeBase?.attendance_opened_at ?? historyMeta?.sessionAt ?? null;

  loadFullHistoryRef.current = loadFullHistory;
  sessionAtRef.current = sessionAt;

  useEffect(() => {
    if (conversations.length === 0) return;
    const prefetchIds = conversations
      .slice(0, 8)
      .map((conv) => conv.id)
      .filter((id) => id !== activeId);
    for (const id of prefetchIds) {
      prefetchConversationMessages(id);
    }
  }, [conversations, activeId, prefetchConversationMessages]);

  const visibleMessages = useMemo(
    () => filterMessagesForSession(messages, sessionAt, loadFullHistory),
    [messages, sessionAt, loadFullHistory],
  );

  const loadOlderHistory = useCallback(() => {
    if (resolvedHistoryMode || historyExpandedRef.current || historyExpanded || historyLoading)
      return;
    if (activeId && openConversationScrollIdRef.current === activeId) return;
    const el = messagesScrollRef.current;
    scrollHeightBeforeHistoryRef.current = el?.scrollHeight ?? 0;
    historyLoadPendingRef.current = true;
    historyExpandedRef.current = true;
    setHistoryExpanded(true);
    setHistoryLoading(true);
    if (!activeId) return;
    void fetchAtendimentoMessagesServer({
      data: { conversationId: activeId, history: true },
    })
      .then((full) => {
        patchMessageCache(qc, activeId, (prev) => mergeMessagesPayload(prev, full));
        setScrollTick((value) => value + 1);
      })
      .finally(() => setHistoryLoading(false));
  }, [resolvedHistoryMode, historyExpanded, historyLoading, activeId, qc]);

  const conversationsForList = useMemo(() => {
    if (!activeId || visibleMessages.length === 0 || resolvedHistoryMode) {
      return conversations;
    }
    const last = visibleMessages[visibleMessages.length - 1];
    if (!last) return conversations;
    const preview = previewFromWabaMessage(last);
    const at = last.created_at;
    return sortConversationsByRecent(
      conversations.map((c) => {
        if (c.id !== activeId) return c;
        const currentAt = String(c.last_message_at ?? "");
        if (at.localeCompare(currentAt) >= 0) {
          return { ...c, last_message_text: preview, last_message_at: at, updated_at: at };
        }
        return c;
      }),
    );
  }, [conversations, activeId, visibleMessages, resolvedHistoryMode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = conversationsForList.filter((c) => {
      if (panel === "conversas") {
        if (c.status === "closed") return false;
      } else if (c.status !== "closed") {
        return false;
      }

      if (panel === "conversas") {
        if (filter === "unread" && c.unread_count <= 0) return false;
        if (filter === "mine" && currentUserId && c.assigned_agent_id !== currentUserId) {
          return false;
        }
        if (filter !== "all" && filter !== "unread" && filter !== "mine" && c.status !== filter) {
          return false;
        }
      }

      if (tagFilter) {
        const contactKey = c.contact_id;
        const tags = contactTagsIndex[contactKey] ?? [];
        if (!tags.includes(tagFilter)) return false;
      }

      if (!q) return true;
      const name = c.contact?.name?.toLowerCase() ?? "";
      const phone = c.contact?.phone?.toLowerCase() ?? "";
      const preview = c.last_message_text?.toLowerCase() ?? "";
      return name.includes(q) || phone.includes(q) || preview.includes(q);
    });
    return sortConversationsByRecent(list);
  }, [conversationsForList, search, filter, panel, tagFilter, contactTagsIndex, currentUserId]);

  const active = useMemo(
    () => conversationsForList.find((c) => c.id === activeId) ?? null,
    [conversationsForList, activeId],
  );

  const hasOlderBeforeSession = historyMeta?.hasOlderBeforeSession ?? false;
  const hasMoreInSession = historyMeta?.hasMoreInSession ?? false;
  const hasMoreInHistory = historyMeta?.hasMoreInHistory ?? false;

  const loadOlderHistoryPage = useCallback(() => {
    if (!activeId || !historyExpanded || historyPageLoading || !hasMoreInHistory) return;
    const oldest = messages[0];
    if (!oldest?.created_at) return;
    const el = messagesScrollRef.current;
    scrollHeightBeforeHistoryRef.current = el?.scrollHeight ?? 0;
    historyLoadPendingRef.current = true;
    setHistoryPageLoading(true);
    void fetchAtendimentoMessagesServer({
      data: { conversationId: activeId, history: true, before: oldest.created_at },
    })
      .then((page) => {
        patchMessageCache(qc, activeId, (prev) => mergeMessagesPayload(prev, page));
        setScrollTick((value) => value + 1);
      })
      .finally(() => setHistoryPageLoading(false));
  }, [activeId, historyExpanded, historyPageLoading, hasMoreInHistory, messages, qc]);

  const hasOlderAttendanceMessages = useMemo(() => {
    if (!sessionAt) return false;
    if (loadFullHistory) {
      return messages.some((m) => m.created_at < sessionAt);
    }
    return hasOlderBeforeSession;
  }, [messages, sessionAt, loadFullHistory, hasOlderBeforeSession]);

  const showHistoryControls =
    !resolvedHistoryMode &&
    (hasOlderBeforeSession ||
      hasMoreInSession ||
      historyExpanded ||
      historyLoading ||
      messages.length >= 80);
  const showSessionDividerInThread =
    !loadFullHistory && hasOlderBeforeSession && visibleMessages.length > 0;

  useEffect(() => {
    historyExpandedRef.current = false;
    setHistoryExpanded(false);
    historyLoadPendingRef.current = false;
  }, [activeId]);

  useEffect(() => {
    if (!activeId || !sessionAt) {
      prevSessionAtRef.current = sessionAt;
      return;
    }
    const freshReopen = freshAttendanceSessionAtRef.current.get(activeId);
    if (
      freshReopen &&
      freshReopen === sessionAt &&
      prevSessionAtRef.current !== sessionAt &&
      !resolvedHistoryMode
    ) {
      void qc.resetQueries({ queryKey: ["atendimento-messages", activeId] });
      stickActiveChatToBottom();
    }
    prevSessionAtRef.current = sessionAt;
  }, [activeId, sessionAt, resolvedHistoryMode, qc, stickActiveChatToBottom]);

  useEffect(() => {
    if (!activeId || !historyMeta?.sessionAt) return;
    const anchor = historyMeta.sessionAt;
    const prev = qc.getQueryData<WabaConversation[]>(["atendimento-conversations"]);
    if (!prev) return;
    const current = prev.find((c) => c.id === activeId);
    if (!current || current.attendance_opened_at === anchor) return;
    qc.setQueryData(
      ["atendimento-conversations"],
      prev.map((c) => (c.id === activeId ? { ...c, attendance_opened_at: anchor } : c)),
    );
  }, [activeId, historyMeta?.sessionAt, qc]);

  useEffect(() => {
    if (!activeId || visibleMessages.length === 0 || resolvedHistoryMode) return;
    const last = visibleMessages[visibleMessages.length - 1];
    if (!last) return;
    const preview = previewFromWabaMessage(last);
    const at = last.created_at;
    const prev = qc.getQueryData<WabaConversation[]>(["atendimento-conversations"]);
    if (!prev) return;
    const current = prev.find((c) => c.id === activeId);
    if (!current) return;
    if (at.localeCompare(String(current.last_message_at ?? "")) > 0) {
      qc.setQueryData(
        ["atendimento-conversations"],
        bumpConversationInList(prev, activeId, preview, { messageAt: at }),
      );
    }
  }, [visibleMessages, activeId, resolvedHistoryMode, qc]);

  useEffect(() => {
    const root = messagesScrollRef.current;
    const sentinel = historyTopSentinelRef.current;
    if (!root || !sentinel || resolvedHistoryMode || historyExpanded || historyLoading) return;
    if (activeId && openConversationScrollIdRef.current === activeId) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          if (activeId && openConversationScrollIdRef.current === activeId) return;
          loadOlderHistory();
        }
      },
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeId, resolvedHistoryMode, historyExpanded, historyLoading, loadOlderHistory]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el || resolvedHistoryMode || historyExpanded) return;

    const onScroll = () => {
      if (activeId && openConversationScrollIdRef.current === activeId) return;
      if (el.scrollTop > 120) return;
      loadOlderHistory();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [activeId, resolvedHistoryMode, historyExpanded, loadOlderHistory, messagesLoading]);

  useEffect(() => {
    if (!activeId) return;
    const current = conversations.find((c) => c.id === activeId);
    if (!current) return;
    if (panel === "conversas" && current.status === "closed") {
      setActiveId(null);
      setShowProfile(false);
    }
    if (panel === "resolvidos" && current.status !== "closed") {
      setActiveId(null);
      setShowProfile(false);
    }
  }, [conversations, activeId, panel]);

  useEffect(() => {
    setReplyTo(null);
  }, [activeId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const chatId = (event as CustomEvent<{ chatId?: string }>).detail?.chatId;
      if (!chatId) return;
      setActiveId(chatId);
      setPanel("conversas");
      setShowProfile(false);
    };
    window.addEventListener(ATENDIMENTO_OPEN_CONVERSATION_EVENT, handler);
    return () => window.removeEventListener(ATENDIMENTO_OPEN_CONVERSATION_EVENT, handler);
  }, []);

  useEffect(() => {
    if (realtimeOk) return;
    for (const conversation of conversations) {
      if (conversation.id === activeId) {
        prevUnreadByChatRef.current.set(conversation.id, conversation.unread_count);
        continue;
      }
      const previousUnread = prevUnreadByChatRef.current.get(conversation.id) ?? 0;
      if (conversation.unread_count > previousUnread) {
        maybeNotifyInboundMessage(
          qc,
          conversation.id,
          conversation.last_message_text ?? "Nova mensagem recebida",
        );
      }
      prevUnreadByChatRef.current.set(conversation.id, conversation.unread_count);
    }
  }, [conversations, activeId, realtimeOk, qc]);

  useEffect(() => {
    let inboxRefetchTimer: number | null = null;
    let activeMessageRefetchTimer: number | null = null;

    const bumpInboxFromCache = (
      conversationId: string,
      preview: string,
      options?: { incrementUnread?: boolean; resetUnread?: boolean; messageAt?: string },
    ) => {
      const prevConversations = qc.getQueryData<WabaConversation[]>(["atendimento-conversations"]);
      if (!prevConversations) return;
      qc.setQueryData(
        ["atendimento-conversations"],
        bumpConversationInList(prevConversations, conversationId, preview, options),
      );
    };

    const refetchInbox = () => {
      void qc.refetchQueries({ queryKey: ["atendimento-conversations"], type: "active" });
    };

    const scheduleRefetchInbox = () => {
      if (inboxRefetchTimer) window.clearTimeout(inboxRefetchTimer);
      inboxRefetchTimer = window.setTimeout(() => {
        refetchInbox();
        inboxRefetchTimer = null;
      }, 600);
    };

    const refetchMessages = (chatId?: string) => {
      if (chatId) {
        void qc.refetchQueries({
          queryKey: ["atendimento-messages", chatId],
          type: "active",
        });
        return;
      }
      void qc.refetchQueries({ queryKey: ["atendimento-messages"], type: "active" });
    };

    const scheduleRefetchActiveMessages = (chatId: string) => {
      if (activeMessageRefetchTimer) window.clearTimeout(activeMessageRefetchTimer);
      activeMessageRefetchTimer = window.setTimeout(() => {
        refetchMessages(chatId);
        activeMessageRefetchTimer = null;
      }, 400);
    };

    const channel = supabase
      .channel("atendimento-whatsapp-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const row = payload.new as {
            id?: string;
            chat_id?: string;
            body?: string | null;
            message_type?: string | null;
            sent_at?: string;
            direction?: string;
            media_url?: string | null;
            wa_message_id?: string | null;
          };
          const chatId = row.chat_id;
          if (chatId) {
            const preview = previewFromWhatsAppMessageRow(row);
            const isInbound = row.direction === "inbound";
            const { displayConversationId, isActiveThread } = resolveMessageThreadConversationId(
              qc,
              chatId,
              activeIdRef.current,
            );
            bumpInboxFromCache(displayConversationId, preview, {
              incrementUnread: isInbound && !isActiveThread,
              resetUnread: isActiveThread,
              messageAt: row.sent_at,
            });
            if (isActiveThread) {
              appendMessageFromRealtime(qc, displayConversationId, row);
              stickActiveChatToBottom();
              scheduleRefetchActiveMessages(displayConversationId);
            } else if (isInbound) {
              maybeNotifyInboundMessage(qc, chatId, preview);
              scheduleRefetchInbox();
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const row = payload.new as { chat_id?: string; media_url?: string | null; id?: string };
          const chatId = row.chat_id;
          if (row.id && row.media_url) {
            void qc.invalidateQueries({ queryKey: ["atendimento-message-media", row.id] });
          }
          if (chatId && chatId !== activeIdRef.current) {
            refetchMessages(chatId);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_chats" },
        (payload) => {
          const row = payload.new as {
            id?: string;
            last_message?: string | null;
            last_message_at?: string | null;
            attendance_opened_at?: string | null;
            inbox_status?: string | null;
          };
          const old = payload.old as {
            attendance_opened_at?: string | null;
            inbox_status?: string | null;
          };
          const sessionOrStatusChanged =
            row.attendance_opened_at !== old?.attendance_opened_at ||
            row.inbox_status !== old?.inbox_status;
          const reopenedFromClosed = old?.inbox_status === "closed" && row.inbox_status === "open";
          if (row.id && sessionOrStatusChanged) {
            const prevConversations = qc.getQueryData<WabaConversation[]>([
              "atendimento-conversations",
            ]);
            if (prevConversations) {
              qc.setQueryData(
                ["atendimento-conversations"],
                prevConversations.map((conv) =>
                  conv.id === row.id
                    ? {
                        ...conv,
                        attendance_opened_at: row.attendance_opened_at ?? conv.attendance_opened_at,
                        status:
                          row.inbox_status === "closed"
                            ? "closed"
                            : row.inbox_status === "pending"
                              ? "pending"
                              : "open",
                      }
                    : conv,
                ),
              );
            }
            if (reopenedFromClosed) {
              if (row.id && row.attendance_opened_at) {
                freshAttendanceSessionAtRef.current.set(row.id, row.attendance_opened_at);
              }
              if (row.id === activeIdRef.current) {
                stickActiveChatToBottom();
              }
              void qc.resetQueries({ queryKey: ["atendimento-messages", row.id] });
              scheduleRefetchInbox();
            }
          }
          if (row.id && row.last_message_at) {
            bumpInboxFromCache(row.id, row.last_message?.trim() || "Mensagem", {
              messageAt: row.last_message_at,
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "waba_messages" },
        (payload) => {
          const row = payload.new as {
            id?: string;
            conversation_id?: string;
            content_text?: string | null;
            content_type?: string | null;
            created_at?: string;
            sender_type?: string;
            media_url?: string | null;
            wa_message_id?: string | null;
            status?: string | null;
            reply_to_wa_message_id?: string | null;
            reply_to_text?: string | null;
            reply_to_from_me?: boolean | null;
          };
          const chatId = row.conversation_id;
          if (chatId) {
            const preview = row.content_text?.trim() || "Mensagem";
            const isInbound = row.sender_type === "customer";
            const { displayConversationId, isActiveThread } = resolveMessageThreadConversationId(
              qc,
              chatId,
              activeIdRef.current,
            );
            bumpInboxFromCache(displayConversationId, preview, {
              incrementUnread: isInbound && !isActiveThread,
              resetUnread: isActiveThread,
              messageAt: row.created_at,
            });
            if (isActiveThread) {
              appendWabaMessageFromRealtime(qc, displayConversationId, row);
              stickActiveChatToBottom();
              scheduleRefetchActiveMessages(displayConversationId);
            } else if (isInbound) {
              maybeNotifyInboundMessage(qc, chatId, preview);
              scheduleRefetchInbox();
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waba_conversations" },
        (payload) => {
          const row = payload.new as {
            id?: string;
            attendance_opened_at?: string | null;
            status?: string | null;
          };
          const old = payload.old as {
            attendance_opened_at?: string | null;
            status?: string | null;
          };
          if (
            row.id &&
            (row.attendance_opened_at !== old?.attendance_opened_at || row.status !== old?.status)
          ) {
            const reopenedFromClosed = old?.status === "closed" && row.status === "open";
            if (reopenedFromClosed) {
              if (row.id && row.attendance_opened_at) {
                freshAttendanceSessionAtRef.current.set(row.id, row.attendance_opened_at);
              }
              if (row.id === activeIdRef.current) {
                stickActiveChatToBottom();
              }
              void qc.resetQueries({ queryKey: ["atendimento-messages", row.id] });
              scheduleRefetchInbox();
            }
          }
        },
      )
      .subscribe((status) => {
        setRealtimeOk(status === "SUBSCRIBED");
      });

    return () => {
      if (inboxRefetchTimer) window.clearTimeout(inboxRefetchTimer);
      if (activeMessageRefetchTimer) window.clearTimeout(activeMessageRefetchTimer);
      setRealtimeOk(false);
      void supabase.removeChannel(channel);
    };
  }, [qc, stickActiveChatToBottom]);

  useEffect(() => {
    if (initialConversationId) {
      setActiveId(initialConversationId);
      void qc.refetchQueries({ queryKey: ["atendimento-conversations"], type: "active" });
    }
  }, [initialConversationId, qc]);

  useEffect(() => {
    if (!activeId) return;
    const prev = qc.getQueryData<WabaConversation[]>(["atendimento-conversations"]);
    if (prev) {
      qc.setQueryData(
        ["atendimento-conversations"],
        prev.map((c) => (c.id === activeId ? { ...c, unread_count: 0 } : c)),
      );
    }
    void markAtendimentoConversationReadServer({ data: { conversationId: activeId } }).catch(() => {
      void qc.refetchQueries({ queryKey: ["atendimento-conversations"], type: "active" });
    });
  }, [activeId, qc]);

  useLayoutEffect(() => {
    if (!activeId) {
      prevActiveIdRef.current = null;
      prevMessageCountRef.current = 0;
      prevFirstMessageIdRef.current = null;
      openConversationScrollIdRef.current = null;
      scrollToBottomPendingRef.current = false;
      return;
    }

    if (activeId !== prevActiveIdRef.current) {
      prevActiveIdRef.current = activeId;
      prevMessageCountRef.current = 0;
      prevFirstMessageIdRef.current = null;
      openConversationScrollIdRef.current = activeId;
      scrollToBottomPendingRef.current = true;
      historyLoadPendingRef.current = false;
      historyExpandedRef.current = false;
      setHistoryExpanded(false);
      setHistoryLoading(false);
      setScrollTick((value) => value + 1);
      queueFocusMessageInput();

      const el = messagesScrollRef.current;
      if (el) scrollMessagesToBottom(el);
    }
  }, [activeId, queueFocusMessageInput, scrollMessagesToBottom]);

  useEffect(() => {
    if (!activeId) return;
    const conversationId = activeId;
    const timer = window.setTimeout(() => {
      if (activeIdRef.current !== conversationId) return;
      void qc.invalidateQueries({
        queryKey: atendimentoMessagesQueryKey(conversationId),
        refetchType: "active",
      });
    }, 4_000);
    return () => window.clearTimeout(timer);
  }, [activeId, qc]);

  useLayoutEffect(() => {
    if (focusInputTick === 0) return;
    const el = messageInputRef.current;
    if (!el || el.disabled) return;
    el.focus({ preventScroll: true });
  }, [focusInputTick]);

  useLayoutEffect(() => {
    if (!activeId) return;

    const el = messagesScrollRef.current;
    if (!el) return;

    const openingConversation = openConversationScrollIdRef.current === activeId;

    if (!openingConversation && messagesLoading && visibleMessages.length === 0) return;
    if (!openingConversation && visibleMessages.length === 0) return;

    const stickToBottom = () => scrollMessagesToBottom(el);

    const firstId = visibleMessages[0]?.id ?? null;
    const messagesPrepended =
      !openingConversation &&
      prevFirstMessageIdRef.current != null &&
      firstId != null &&
      firstId !== prevFirstMessageIdRef.current;

    if (historyLoadPendingRef.current && messagesPrepended && !openingConversation) {
      historyLoadPendingRef.current = false;
      const anchorHeight = scrollHeightBeforeHistoryRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = Math.max(0, el.scrollHeight - anchorHeight);
      });
      prevMessageCountRef.current = visibleMessages.length;
      prevFirstMessageIdRef.current = firstId;
      return;
    }

    if (historyLoadPendingRef.current && !openingConversation) {
      prevMessageCountRef.current = visibleMessages.length;
      prevFirstMessageIdRef.current = firstId;
      return;
    }

    const appendedAtEnd =
      visibleMessages.length > prevMessageCountRef.current && !messagesPrepended;

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    const shouldStick =
      openingConversation ||
      scrollToBottomPendingRef.current ||
      appendedAtEnd ||
      (visibleMessages.length > prevMessageCountRef.current && nearBottom && !messagesPrepended);

    if (historyExpanded && !shouldStick) {
      prevMessageCountRef.current = visibleMessages.length;
      prevFirstMessageIdRef.current = firstId;
      return;
    }

    if (!shouldStick) {
      prevMessageCountRef.current = visibleMessages.length;
      prevFirstMessageIdRef.current = firstId;
      return;
    }

    if (!openingConversation) {
      scrollToBottomPendingRef.current = false;
    }
    prevMessageCountRef.current = visibleMessages.length;
    prevFirstMessageIdRef.current = firstId;

    stickToBottom();

    const timeouts = [0, 50, 150, 400, 800, 1200].map((ms) => window.setTimeout(stickToBottom, ms));
    const inner = el.querySelector("[data-messages-inner]");
    const observerMs = openingConversation ? 3000 : 1200;
    const observer = new ResizeObserver(() => {
      if (openingConversation || (!historyExpanded && !historyLoadPendingRef.current)) {
        stickToBottom();
        if (openingConversation) {
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (atBottom && visibleMessages.length > 0 && !messagesLoading && !messagesFetching) {
            openConversationScrollIdRef.current = null;
            scrollToBottomPendingRef.current = false;
          }
        }
      }
    });
    if (inner) observer.observe(inner);
    observer.observe(el);

    const stopObserver = window.setTimeout(() => {
      observer.disconnect();
      if (openConversationScrollIdRef.current === activeId) {
        openConversationScrollIdRef.current = null;
        scrollToBottomPendingRef.current = false;
      }
    }, observerMs);

    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(stopObserver);
      observer.disconnect();
    };
  }, [
    visibleMessages,
    activeId,
    messagesLoading,
    messagesFetching,
    scrollTick,
    historyExpanded,
    scrollMessagesToBottom,
  ]);

  const scrollToQuotedMessage = useCallback(
    (quotingMessage: WabaMessage) => {
      const pool = loadFullHistory ? messages : visibleMessages;
      const target = findQuotedTargetMessage(pool, quotingMessage.reply_to_wa_message_id, {
        text: quotingMessage.reply_to_text,
        fromMe: quotingMessage.reply_to_from_me,
        quotingAt: quotingMessage.created_at,
      });
      if (!target) {
        if (!loadFullHistory && (hasOlderBeforeSession || hasMoreInSession)) {
          pendingQuoteRef.current = {
            waMessageId: quotingMessage.reply_to_wa_message_id ?? null,
            text: quotingMessage.reply_to_text ?? null,
            fromMe: quotingMessage.reply_to_from_me ?? null,
            quotingAt: quotingMessage.created_at,
          };
          loadOlderHistory();
          toast.message("Carregando historico para localizar a citacao...");
          return;
        }
        toast.message("Mensagem original nao encontrada nesta conversa.");
        return;
      }

      const element = messageRefs.current.get(target.id);
      if (!element) return;

      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(target.id);
      if (highlightTimerRef.current != null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedMessageId(null);
        highlightTimerRef.current = null;
      }, 1600);
    },
    [
      messages,
      visibleMessages,
      loadFullHistory,
      loadOlderHistory,
      hasOlderBeforeSession,
      hasMoreInSession,
    ],
  );

  useEffect(() => {
    const pending = pendingQuoteRef.current;
    if (!pending || !historyExpanded || historyLoading) return;
    const target = findQuotedTargetMessage(messages, pending.waMessageId, {
      text: pending.text,
      fromMe: pending.fromMe,
      quotingAt: pending.quotingAt,
    });
    if (!target) return;
    pendingQuoteRef.current = null;
    const element = messageRefs.current.get(target.id);
    if (!element) return;
    requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(target.id);
      if (highlightTimerRef.current != null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedMessageId(null);
        highlightTimerRef.current = null;
      }, 1600);
    });
  }, [messages, historyExpanded, historyLoading]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current != null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    messageRefs.current.clear();
    setHighlightedMessageId(null);
  }, [activeId]);

  useEffect(() => {
    if (!showProfile) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowProfile(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showProfile]);

  const sendMutation = useMutation({
    mutationFn: (payload: { text: string; quotedMessageId?: string }) =>
      sendAtendimentoMessageServer({
        data: {
          conversationId: activeId!,
          text: payload.text,
          quotedMessageId: payload.quotedMessageId,
        },
      }),
    onMutate: async ({ text, quotedMessageId }) => {
      if (!activeId) return;
      const preview = text.trim();
      const quotedMessage = quotedMessageId
        ? (visibleMessages.find((message) => message.id === quotedMessageId) ??
          messages.find((message) => message.id === quotedMessageId) ??
          replyTo)
        : null;
      const messageKey = atendimentoMessagesQueryKey(activeId);
      await qc.cancelQueries({ queryKey: messageKey });
      await qc.cancelQueries({ queryKey: ["atendimento-conversations"] });
      const previous = qc.getQueryData<AtendimentoMessagesPayload>(messageKey);
      const prevConversations = qc.getQueryData<WabaConversation[]>(["atendimento-conversations"]);
      const optimistic: WabaMessage = {
        id: `optimistic-${Date.now()}`,
        conversation_id: activeId,
        sender_type: "agent",
        sender_id: null,
        content_type: "text",
        content_text: preview,
        media_url: null,
        template_name: null,
        wa_message_id: null,
        status: "sent",
        created_at: new Date().toISOString(),
        reply_to_wa_message_id: quotedMessage?.wa_message_id ?? null,
        reply_to_text: quotedMessage ? wabaMessageReplyPreview(quotedMessage) : null,
        reply_to_from_me: quotedMessage ? quotedMessage.sender_type !== "customer" : null,
      };
      setMessagePayloadMessages(qc, messageKey, [...(previous?.messages ?? []), optimistic]);
      if (prevConversations) {
        qc.setQueryData(
          ["atendimento-conversations"],
          bumpConversationInList(prevConversations, activeId, preview),
        );
      }
      stickActiveChatToBottom();
      setDraft("");
      setReplyTo(null);
      queueFocusMessageInput();
      const sentReply = quotedMessage
        ? {
            reply_to_wa_message_id: quotedMessage.wa_message_id ?? null,
            reply_to_text: wabaMessageReplyPreview(quotedMessage),
            reply_to_from_me: quotedMessage.sender_type !== "customer",
          }
        : null;
      return { previous, prevConversations, messageKey, sentReply, sentText: preview };
    },
    onError: (error, _text, context) => {
      if (context?.previous && context.messageKey) {
        qc.setQueryData(context.messageKey, context.previous);
      }
      if (context?.prevConversations) {
        qc.setQueryData(["atendimento-conversations"], context.prevConversations);
      }
      toast.error(error instanceof Error ? error.message : "Falha ao enviar mensagem.");
      queueFocusMessageInput();
    },
    onSuccess: (_data, variables, context) => {
      if (!activeId || !context?.messageKey) return;
      const sentReply = context.sentReply;
      const sentText = context.sentText ?? variables.text.trim();
      if (!sentReply) return;
      const payload = qc.getQueryData<AtendimentoMessagesPayload>(context.messageKey);
      if (!payload) return;
      setMessagePayloadMessages(
        qc,
        context.messageKey,
        payload.messages.map((msg) => {
          if (
            msg.sender_type === "agent" &&
            msg.content_text?.trim() === sentText &&
            !msg.reply_to_text
          ) {
            return { ...msg, ...sentReply };
          }
          return msg;
        }),
      );
    },
    onSettled: () => {
      if (activeId) {
        void qc.refetchQueries({ queryKey: atendimentoMessagesQueryKey(activeId), type: "active" });
      }
      queueFocusMessageInput();
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: WabaConversationStatus) =>
      updateAtendimentoConversationStatusServer({
        data: { conversationId: activeId!, status },
      }),
    onSuccess: (_data, status) => {
      void qc.refetchQueries({ queryKey: ["atendimento-conversations"], type: "active" });
      if (status === "closed") {
        if (activeId) freshAttendanceSessionAtRef.current.delete(activeId);
        toast.success("Atendimento encerrado.");
        setActiveId(null);
        setShowProfile(false);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar status.");
    },
  });

  const linkPhoneMutation = useMutation({
    mutationFn: (phone: string) =>
      linkAtendimentoConversationPhoneServer({
        data: { conversationId: activeId!, phone },
      }),
    onSuccess: () => {
      toast.success("Telefone cadastrado na agenda.");
      void qc.refetchQueries({ queryKey: ["atendimento-conversations"], type: "active" });
      void qc.refetchQueries({ queryKey: ["atendimento-messages", activeId], type: "active" });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao cadastrar telefone.");
    },
  });

  const sendMediaMutation = useMutation({
    mutationFn: (payload: {
      mediatype: "image" | "document" | "audio" | "video";
      base64: string;
      mimetype?: string;
      caption?: string;
      fileName?: string;
    }) => sendAtendimentoMediaServer({ data: { conversationId: activeId!, ...payload } }),
    onMutate: async (payload) => {
      if (!activeId) return;
      const preview = payload.caption?.trim() || mediaPreviewLabel(payload.mediatype);
      await qc.cancelQueries({ queryKey: ["atendimento-conversations"] });
      const prevConversations = qc.getQueryData<WabaConversation[]>(["atendimento-conversations"]);
      if (prevConversations) {
        qc.setQueryData(
          ["atendimento-conversations"],
          bumpConversationInList(prevConversations, activeId, preview),
        );
      }
      return { prevConversations };
    },
    onError: (error, _payload, context) => {
      if (context?.prevConversations) {
        qc.setQueryData(["atendimento-conversations"], context.prevConversations);
      }
      toast.error(error instanceof Error ? error.message : "Falha ao enviar arquivo.");
    },
    onSuccess: () => {
      stickActiveChatToBottom();
      queueFocusMessageInput();
    },
  });

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeId || sendMediaMutation.isPending) return;

    try {
      const base64 = await fileToBase64(file);
      const isImage = file.type.startsWith("image/");
      const isAudio = file.type.startsWith("audio/");
      const isVideo = file.type.startsWith("video/");
      await sendMediaMutation.mutateAsync({
        mediatype: isImage ? "image" : isAudio ? "audio" : isVideo ? "video" : "document",
        base64,
        mimetype: file.type,
        fileName: file.name,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar arquivo.");
    }
  }

  async function startRecording() {
    if (!activeId || !connected) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        try {
          const base64 = await fileToBase64(new File([blob], "audio.webm", { type: blob.type }));
          await sendMediaMutation.mutateAsync({
            mediatype: "audio",
            base64,
            mimetype: blob.type,
            fileName: "audio.webm",
          });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Falha ao enviar audio.");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast.error("Nao foi possivel acessar o microfone.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  const connected = config?.inbox_connected ?? false;
  const mediaEnabled = config?.active_provider !== "meta";
  const hasActiveConv = !!active;
  const activeFilter = CONVERSAS_FILTER_OPTIONS.find((o) => o.value === filter);
  const panelTitle = panel === "conversas" ? "Conversas" : "Resolvidos";

  function submitDraft() {
    const text = draft.trim();
    if (!text || !activeId || !connected) return;
    sendMutation.mutate({
      text,
      quotedMessageId: replyTo && canQuoteWabaMessage(replyTo) ? replyTo.id : undefined,
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      {!connected ? (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2">
          <WifiOff className="size-4 text-amber-700" />
          <p className="text-xs text-amber-900">
            WhatsApp não conectado ({config?.provider_label ?? "—"}). Configure em{" "}
            <Link
              to="/painel/atendimento/configuracoes"
              className="font-medium text-sage underline"
            >
              Configurações
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Lista de conversas */}
        <div
          className={cn(
            "flex min-h-0 w-full flex-col border-[color:var(--honey-line)] bg-card lg:w-80 lg:shrink-0 lg:border-r",
            hasActiveConv ? "hidden lg:flex" : "flex",
          )}
        >
          <div className="shrink-0 space-y-2 border-b border-[color:var(--honey-line)] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[color:var(--gestao-ink)]">{panelTitle}</p>
              <button
                type="button"
                onClick={() => void refreshInbox()}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-[color:var(--gestao-cream)]/60"
                aria-label="Atualizar"
              >
                <RefreshCw className={cn("size-4", (isLoading || isFetching) && "animate-spin")} />
              </button>
            </div>

            <div className="flex gap-1 rounded-lg bg-[color:var(--gestao-cream)]/50 p-1">
              <button
                type="button"
                onClick={() => {
                  setPanel("conversas");
                  setFilter("all");
                }}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition",
                  panel === "conversas"
                    ? "bg-card text-[color:var(--gestao-ink)] shadow-sm"
                    : "text-muted-foreground hover:text-[color:var(--gestao-ink)]",
                )}
              >
                <MessageSquare className="size-3.5" />
                Conversas
                {activeCounts.active > 0 ? (
                  <span className="rounded-full bg-sage/15 px-1.5 text-[10px] text-sage">
                    {activeCounts.active}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPanel("resolvidos");
                  setFilter("all");
                  setActiveId(null);
                  setShowProfile(false);
                }}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition",
                  panel === "resolvidos"
                    ? "bg-card text-[color:var(--gestao-ink)] shadow-sm"
                    : "text-muted-foreground hover:text-[color:var(--gestao-ink)]",
                )}
              >
                <Archive className="size-3.5" />
                Resolvidos
                {activeCounts.resolved > 0 ? (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                    {activeCounts.resolved}
                  </span>
                ) : null}
              </button>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={panel === "conversas" ? "Buscar conversas..." : "Buscar resolvidos..."}
                className={cn(gestao.input, "bg-[color:var(--gestao-cream)]/40 pl-9 text-sm")}
              />
            </div>
            {panel === "conversas" ? (
              <div className="flex flex-wrap items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-[color:var(--gestao-cream)]/60 hover:text-[color:var(--gestao-ink)]"
                    >
                      {activeFilter?.label ?? "Todas ativas"}
                      <ChevronDown className="size-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {CONVERSAS_FILTER_OPTIONS.map((opt) => (
                      <DropdownMenuItem
                        key={opt.value}
                        onClick={() => setFilter(opt.value)}
                        className={cn("text-sm", filter === opt.value && "text-sage")}
                      >
                        {opt.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {allTags.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-[color:var(--gestao-cream)]/60 hover:text-[color:var(--gestao-ink)]"
                      >
                        {tagFilter
                          ? String(allTags.find((t) => t.id === tagFilter)?.name ?? "Tag")
                          : "Tag"}
                        <ChevronDown className="size-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => setTagFilter(null)} className="text-sm">
                        Todas as tags
                      </DropdownMenuItem>
                      {allTags.map((tag) => (
                        <DropdownMenuItem
                          key={tag.id as string}
                          onClick={() => setTagFilter(tag.id as string)}
                          className={cn("text-sm", tagFilter === tag.id && "text-sage")}
                        >
                          {tag.name as string}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            ) : (
              <p className="px-1 text-xs text-muted-foreground">
                Histórico de atendimentos encerrados
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [overflow-anchor:none]">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="size-5 animate-spin rounded-full border-2 border-sage border-t-transparent" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {panel === "conversas"
                    ? "Nenhum atendimento ativo. A caixa fica limpa até chegar uma nova mensagem."
                    : "Nenhum atendimento resolvido ainda."}
                </p>
              </div>
            ) : (
              filtered.map((conv) => (
                <ConversationRow
                  key={conv.id}
                  conv={conv}
                  active={conv.id === activeId}
                  onHover={() => prefetchConversationMessages(conv.id)}
                  onClick={() => {
                    setActiveId(conv.id);
                    setShowProfile(false);
                  }}
                />
              ))
            )}
            {isFetching && !isLoading ? (
              <p className="px-4 pb-3 text-xs text-muted-foreground">Atualizando...</p>
            ) : null}
          </div>
        </div>

        {/* Thread central */}
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card",
            hasActiveConv ? "flex" : "hidden lg:flex",
            showProfile && "hidden lg:flex",
          )}
        >
          {!active ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-sage/10 text-sage">
                <MessageSquare className="size-6" />
              </div>
              <h3 className="font-display text-xl text-[color:var(--gestao-ink)]">
                {panel === "conversas" ? "Caixa de entrada" : "Atendimentos resolvidos"}
              </h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                {panel === "conversas"
                  ? `Selecione uma conversa para responder via WhatsApp (${config?.provider_label ?? "Atendimento"}).`
                  : "Selecione um atendimento para ver o histórico completo da conversa."}
              </p>
            </div>
          ) : (
            <>
              <header className="flex shrink-0 items-center gap-3 border-b border-[color:var(--honey-line)] px-4 py-3">
                <button
                  type="button"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-sage/10 lg:hidden"
                  onClick={() => {
                    setActiveId(null);
                    setShowProfile(false);
                  }}
                  aria-label="Voltar para conversas"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowProfile((v) => !v)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition hover:bg-[color:var(--gestao-cream)]/50"
                  aria-label="Ver perfil do contato"
                >
                  <ContactAvatar
                    name={active.contact?.name ?? active.contact?.phone}
                    imageUrl={active.contact?.avatar_url}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[color:var(--gestao-ink)]">
                      {active.contact?.name ?? active.contact?.phone ?? "Contato"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {active.contact?.phone ? (
                        active.contact.phone
                      ) : (
                        <span
                          role="button"
                          tabIndex={0}
                          className="italic underline-offset-2 hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setShowProfile(true);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              setShowProfile(true);
                            }
                          }}
                        >
                          Telefone nao identificado — cadastrar
                        </span>
                      )}
                    </p>
                  </div>
                </button>
                {!resolvedHistoryMode && active.status !== "closed" ? (
                  <button
                    type="button"
                    onClick={() => statusMutation.mutate("closed")}
                    disabled={statusMutation.isPending}
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-sage/10 text-sage transition hover:bg-sage/20 disabled:opacity-50"
                    aria-label="Encerrar atendimento"
                    title="Encerrar atendimento"
                  >
                    <Check className="size-4" strokeWidth={2.5} />
                  </button>
                ) : null}
              </header>

              {showHistoryControls ? (
                <div className="shrink-0 border-b border-[color:var(--honey-line)] bg-card/90 px-4 py-2">
                  {historyExpanded ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {hasMoreInHistory
                            ? "Historico parcial — carregue mais abaixo"
                            : "Historico completo visivel"}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            historyLoadPendingRef.current = false;
                            historyExpandedRef.current = false;
                            pendingQuoteRef.current = null;
                            setHistoryExpanded(false);
                            scrollToBottomPendingRef.current = true;
                            setScrollTick((value) => value + 1);
                          }}
                          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-sage transition hover:bg-sage/10"
                        >
                          Só novo atendimento
                        </button>
                      </div>
                      {hasMoreInHistory ? (
                        <button
                          type="button"
                          onClick={loadOlderHistoryPage}
                          disabled={historyPageLoading}
                          className="w-full rounded-lg border border-dashed border-[color:var(--honey-line)] px-3 py-2 text-xs text-muted-foreground transition hover:border-sage/40 hover:bg-sage/5 disabled:opacity-60"
                        >
                          {historyPageLoading
                            ? "Carregando mensagens anteriores..."
                            : "↑ Carregar mensagens mais antigas"}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={loadOlderHistory}
                      disabled={historyLoading || messagesFetching}
                      className="w-full rounded-lg border border-dashed border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40 px-3 py-2 text-xs text-muted-foreground transition hover:border-sage/40 hover:bg-sage/5 hover:text-[color:var(--gestao-ink)] disabled:opacity-60"
                    >
                      {historyLoading || messagesFetching
                        ? "Carregando histórico..."
                        : hasMoreInSession
                          ? "↑ Ver mensagens anteriores deste atendimento"
                          : "↑ Ver histórico anterior (ou role para cima)"}
                    </button>
                  )}
                </div>
              ) : null}

              <div
                ref={messagesScrollRef}
                className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [overflow-anchor:none] bg-[color:var(--gestao-cream)]/25 px-4 py-4"
              >
                {resolvedHistoryMode ? (
                  <p className="mb-3 rounded-lg border border-[color:var(--honey-line)] bg-card px-3 py-2 text-xs text-muted-foreground">
                    Atendimento encerrado — apenas consulta. Uma nova mensagem do cliente reabre em
                    Conversas.
                  </p>
                ) : null}
                <div className="space-y-3" data-messages-inner>
                  <div ref={historyTopSentinelRef} className="h-px w-full shrink-0" aria-hidden />
                  {historyLoading && historyExpanded ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      Carregando histórico anterior...
                    </p>
                  ) : null}
                  {messagesLoading && visibleMessages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Carregando mensagens...</p>
                  ) : (
                    visibleMessages.map((msg, index) => {
                      const prev = visibleMessages[index - 1];
                      const showSessionStart = showSessionDividerInThread && index === 0;
                      const showSessionDivider =
                        loadFullHistory &&
                        Boolean(sessionAt) &&
                        hasOlderAttendanceMessages &&
                        msg.created_at >= sessionAt! &&
                        (!prev || prev.created_at < sessionAt!);
                      return (
                        <Fragment key={msg.id}>
                          {showSessionStart ? (
                            <AttendanceSessionDivider label={sessionDividerLabel("start")} />
                          ) : null}
                          {showSessionDivider ? (
                            <AttendanceSessionDivider label={sessionDividerLabel("boundary")} />
                          ) : null}
                          <MessageBubble
                            msg={msg}
                            showReply={!resolvedHistoryMode}
                            onReply={setReplyTo}
                            highlighted={highlightedMessageId === msg.id}
                            rootRef={(node) => {
                              if (node) messageRefs.current.set(msg.id, node);
                              else messageRefs.current.delete(msg.id);
                            }}
                            onQuoteClick={
                              canJumpToQuotedMessage(msg)
                                ? () => scrollToQuotedMessage(msg)
                                : undefined
                            }
                          />
                        </Fragment>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} aria-hidden className="h-px shrink-0" />
                </div>
              </div>

              {resolvedHistoryMode ? (
                <footer className="shrink-0 border-t border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40 px-4 py-3">
                  <p className="text-center text-xs text-muted-foreground">
                    Atendimento resolvido — apenas consulta. Uma nova mensagem do cliente abre um
                    novo atendimento em Conversas.
                  </p>
                </footer>
              ) : (
                <footer className="shrink-0 border-t border-[color:var(--honey-line)] bg-card p-3">
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitDraft();
                    }}
                  >
                    {replyTo ? (
                      <ReplyPreviewBar message={replyTo} onCancel={() => setReplyTo(null)} />
                    ) : null}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="audio/*,image/*,video/*,.pdf,.doc,.docx"
                      onChange={handleFileChange}
                    />
                    <div className="flex items-end gap-2">
                      <GestaoButton
                        type="button"
                        variant="secondary"
                        className="shrink-0 px-3"
                        disabled={!connected || !mediaEnabled || sendMediaMutation.isPending}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="size-4" />
                      </GestaoButton>
                      <EmojiPickerButton
                        disabled={!connected}
                        onPick={(emoji) => setDraft((current) => current + emoji)}
                      />
                      <GestaoInput
                        ref={messageInputRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Escreva uma mensagem..."
                        className="min-w-0 flex-1"
                        disabled={!connected}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            submitDraft();
                          }
                          if (e.key === "Escape" && replyTo) {
                            e.preventDefault();
                            setReplyTo(null);
                          }
                        }}
                      />
                      <GestaoButton
                        type="button"
                        variant="secondary"
                        className={cn("shrink-0 px-3", recording && "bg-rose-100 text-rose-700")}
                        disabled={!connected || !mediaEnabled || sendMediaMutation.isPending}
                        onClick={recording ? stopRecording : startRecording}
                      >
                        {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
                      </GestaoButton>
                      <GestaoButton
                        type="submit"
                        disabled={!connected || !draft.trim()}
                        onMouseDown={(event) => event.preventDefault()}
                      >
                        <SendHorizontal className="size-4" />
                      </GestaoButton>
                    </div>
                    {recording ? (
                      <p className="text-xs text-rose-600">
                        Gravando... clique no quadrado para enviar.
                      </p>
                    ) : null}
                    {sendMutation.isError ? (
                      <p className="text-sm text-destructive">
                        {sendMutation.error instanceof Error
                          ? sendMutation.error.message
                          : "Erro ao enviar mensagem"}
                      </p>
                    ) : null}
                  </form>
                </footer>
              )}
            </>
          )}
        </div>

        {/* Sidebar contato — wacrm desktop */}
        {active && showProfile ? (
          <aside className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-[color:var(--honey-line)] bg-card lg:w-[300px] lg:border-l">
            <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--honey-line)] px-3 py-3 lg:hidden">
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full bg-sage/10"
                onClick={() => setShowProfile(false)}
                aria-label="Voltar para conversa"
              >
                <ArrowLeft className="size-4" />
              </button>
              <p className="text-sm font-semibold text-[color:var(--gestao-ink)]">
                Perfil do contato
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
              <AtendimentoContactSidebar
                contact={active.contact ?? null}
                conversation={active}
                onStatusChange={(status) => statusMutation.mutate(status)}
                statusUpdating={statusMutation.isPending}
                onLinkPhone={(phone) => linkPhoneMutation.mutate(phone)}
                linkingPhone={linkPhoneMutation.isPending}
                onConversationMerged={(targetId) => {
                  setActiveId(targetId);
                  setShowProfile(false);
                }}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function ConversationRow({
  conv,
  active,
  onClick,
  onHover,
}: {
  conv: WabaConversation;
  active: boolean;
  onClick: () => void;
  onHover?: () => void;
}) {
  const displayName = conv.contact?.name ?? conv.contact?.phone ?? "Sem nome";

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      onFocus={onHover}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-[color:var(--gestao-cream)]/50",
        active && "border-l-2 border-sage bg-sage/5",
      )}
    >
      <ContactAvatar name={displayName} imageUrl={conv.contact?.avatar_url} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-[color:var(--gestao-ink)]">
            {displayName}
          </span>
          {conv.last_message_at ? (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatChatTime(conv.last_message_at)}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {conv.last_message_text || "Sem mensagens"}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {conv.unread_count > 0 ? (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-sage px-1 text-[10px] font-bold text-primary-foreground">
                {conv.unread_count}
              </span>
            ) : null}
            <span
              className={cn("size-2 rounded-full", STATUS_DOT[conv.status])}
              title={conv.status}
            />
          </div>
        </div>
      </div>
    </button>
  );
}

function AttendanceSessionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2" role="separator" aria-label={label}>
      <div className="h-px flex-1 bg-[color:var(--honey-line)]" />
      <span className="shrink-0 rounded-full border border-[color:var(--honey-line)] bg-card px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="h-px flex-1 bg-[color:var(--honey-line)]" />
    </div>
  );
}

function ReplyPreviewBar({ message, onCancel }: { message: WabaMessage; onCancel: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-sage/30 bg-sage/10 px-3 py-2">
      <div className="w-1 shrink-0 self-stretch rounded-full bg-sage" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-sage">Respondendo</p>
        <p className="truncate text-xs text-muted-foreground">{wabaMessageReplyPreview(message)}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md p-1 text-muted-foreground transition hover:bg-black/5 hover:text-[color:var(--gestao-ink)]"
        aria-label="Cancelar resposta"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function MessageQuotedBlock({
  text,
  outbound,
  quotedFromMe,
  onClick,
}: {
  text: string;
  outbound: boolean;
  quotedFromMe?: boolean | null;
  onClick?: () => void;
}) {
  const quoteLabel =
    !outbound && quotedFromMe === true
      ? "Voce"
      : !outbound && quotedFromMe === false
        ? "Cliente"
        : null;

  const className = cn(
    "mb-2 w-full rounded-md border-l-2 px-2 py-1 text-left",
    outbound ? "border-primary-foreground/50 bg-black/10" : "border-sage bg-sage/10",
    onClick && "cursor-pointer transition hover:brightness-95",
  );

  const content = (
    <>
      {quoteLabel ? (
        <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-sage">
          {quoteLabel}
        </p>
      ) : null}
      <p
        className={cn(
          "line-clamp-2 text-[11px]",
          outbound ? "text-primary-foreground/90" : "text-muted-foreground",
        )}
      >
        {text}
      </p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        title="Ir para mensagem original"
        aria-label="Ir para mensagem original"
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function MessageBubble({
  msg,
  onReply,
  showReply,
  highlighted,
  rootRef,
  onQuoteClick,
}: {
  msg: WabaMessage;
  onReply?: (msg: WabaMessage) => void;
  showReply?: boolean;
  highlighted?: boolean;
  rootRef?: (node: HTMLDivElement | null) => void;
  onQuoteClick?: () => void;
}) {
  const outbound = msg.sender_type !== "customer";
  const failed = outbound && msg.status === "failed";
  const replyButton =
    showReply && onReply ? (
      <button
        type="button"
        onClick={() => onReply(msg)}
        className="mb-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--honey-line)] bg-card text-sage shadow-sm transition hover:border-sage/40 hover:bg-sage/10"
        aria-label="Responder mensagem"
        title="Responder"
      >
        <CornerDownLeft className="size-4" />
      </button>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex items-end gap-2 rounded-2xl transition-shadow duration-500",
        outbound ? "justify-end" : "justify-start",
        highlighted && "ring-2 ring-sage/60 ring-offset-2 ring-offset-[color:var(--gestao-cream)]",
      )}
    >
      {!outbound ? replyButton : null}
      <div
        className={cn(
          "max-w-[min(100%,520px)] rounded-2xl px-3 py-2 shadow-sm",
          failed
            ? "rounded-br-md border border-destructive/40 bg-destructive/10 text-destructive"
            : outbound
              ? "rounded-br-md bg-sage text-primary-foreground"
              : "rounded-bl-md border border-[color:var(--honey-line)] bg-white text-[color:var(--gestao-ink)]",
        )}
      >
        {msg.reply_to_text ? (
          <MessageQuotedBlock
            text={msg.reply_to_text}
            outbound={outbound}
            quotedFromMe={msg.reply_to_from_me}
            onClick={onQuoteClick}
          />
        ) : null}

        {msg.content_type === "audio" ||
        msg.content_type === "image" ||
        msg.content_type === "video" ||
        msg.content_type === "document" ? (
          <MediaMessagePlayer msg={msg} outbound={outbound} />
        ) : null}

        {msg.content_text && msg.content_type !== "audio" ? (
          <p className="whitespace-pre-wrap text-sm">{msg.content_text}</p>
        ) : null}

        {!msg.content_text && msg.content_type === "text" ? (
          <p className="text-sm italic opacity-70">(mensagem indisponível)</p>
        ) : null}

        {!msg.content_text &&
        msg.content_type !== "text" &&
        msg.content_type !== "audio" &&
        msg.content_type !== "image" &&
        msg.content_type !== "video" &&
        msg.content_type !== "document" ? (
          <p className="text-sm">[{msg.content_type}]</p>
        ) : null}

        <p
          className={cn(
            "mt-1 text-[10px] tabular-nums",
            failed
              ? "text-destructive/80"
              : outbound
                ? "text-primary-foreground/80"
                : "text-muted-foreground",
          )}
        >
          {new Date(msg.created_at).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {failed
            ? " · Não entregue"
            : outbound && msg.status === "delivered"
              ? " · Entregue"
              : null}
        </p>
        {failed && msg.error_detail ? (
          <p className="mt-1 text-[10px] opacity-90">{msg.error_detail}</p>
        ) : null}
      </div>
      {outbound ? replyButton : null}
    </div>
  );
}

function MediaMessagePlayer({ msg, outbound }: { msg: WabaMessage; outbound: boolean }) {
  const hasPlayableUrl = isDirectPlayableMediaUrl(msg.media_url);
  const needsFetch =
    ["audio", "image", "video", "document"].includes(msg.content_type) && !hasPlayableUrl;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["atendimento-message-media", msg.id],
    queryFn: () => fetchAtendimentoMessageMediaServer({ data: { messageId: msg.id } }),
    enabled: needsFetch,
    staleTime: 60 * 60 * 1000,
    retry: 2,
  });

  const fetchedUrl = data?.url && isDirectPlayableMediaUrl(data.url) ? data.url : null;
  const src = hasPlayableUrl ? msg.media_url : fetchedUrl;
  const mutedText = outbound ? "text-primary-foreground/80" : "text-muted-foreground";

  if (isLoading) {
    return <p className={cn("mb-1 text-xs", mutedText)}>Carregando midia...</p>;
  }

  if (!src) {
    const mediaLabel =
      msg.content_type === "image"
        ? "📷 Imagem"
        : msg.content_type === "video"
          ? "🎬 Video"
          : msg.content_type === "document"
            ? `📎 ${msg.content_text?.trim() || "Documento"}`
            : msg.content_type === "audio"
              ? "🎤 Audio"
              : "Midia";
    if (["image", "video", "document", "audio"].includes(msg.content_type)) {
      return (
        <p
          className={cn(
            "mb-1 text-sm",
            outbound ? "text-primary-foreground/90" : "text-muted-foreground",
          )}
        >
          {mediaLabel}
          {isLoading ? " (carregando...)" : isError ? " — indisponivel" : ""}
        </p>
      );
    }
    return (
      <p
        className={cn(
          "mb-1 text-sm",
          outbound ? "text-primary-foreground/90" : "text-muted-foreground",
        )}
      >
        Midia indisponivel
      </p>
    );
  }

  if (msg.content_type === "audio") {
    return (
      <div className="mb-1 min-w-[220px]">
        <audio
          controls
          preload="metadata"
          src={src}
          className={cn("w-full max-w-xs", outbound ? "[color-scheme:dark]" : "")}
        />
      </div>
    );
  }

  if (msg.content_type === "image") {
    return (
      <ZoomableChatImage
        src={src}
        alt={msg.content_text ?? "Imagem"}
        className="mb-2 max-h-64 rounded-xl object-cover"
        onError={() => {
          if (needsFetch) void refetch();
        }}
      />
    );
  }

  if (msg.content_type === "video") {
    return (
      <video
        controls
        preload="metadata"
        src={src}
        className="mb-2 max-h-64 max-w-full rounded-xl"
        onError={() => {
          if (needsFetch) void refetch();
        }}
      />
    );
  }

  if (msg.content_type === "document") {
    const isPdf = src.startsWith("data:application/pdf");
    if (isPdf) {
      return (
        <div className="mb-2 space-y-2">
          <iframe
            title={msg.content_text ?? "Documento PDF"}
            src={src}
            className="h-48 w-full max-w-sm rounded-xl border border-[color:var(--honey-line)] bg-white"
          />
          <a
            href={src}
            download={msg.content_text ?? "documento.pdf"}
            className={cn(
              "block text-sm underline",
              outbound ? "text-primary-foreground" : "text-sage",
            )}
          >
            Baixar PDF
          </a>
        </div>
      );
    }
    return (
      <a
        href={src}
        download={msg.content_text ?? "documento"}
        className={cn(
          "mb-1 block text-sm underline",
          outbound ? "text-primary-foreground" : "text-sage",
        )}
      >
        {msg.content_text?.trim() || "Baixar documento"}
      </a>
    );
  }

  return null;
}
