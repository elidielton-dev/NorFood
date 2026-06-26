import { useCallback, useEffect, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  fetchStaffAtendimentoNotificationPrefsServer,
  saveStaffAtendimentoNotificationPrefsServer,
} from "@/lib/api/atendimento.functions";
import { playAtendimentoInboundChime } from "@/lib/atendimento/inbound-chime";
import type { WabaConversation } from "@/lib/waba/types";

const STORAGE_KEY = "am-atendimento-notifications";
export const ATENDIMENTO_NOTIFICATION_SETTINGS_EVENT = "atendimento-notification-settings";
export const ATENDIMENTO_OPEN_CONVERSATION_EVENT = "atendimento-open-conversation";

export type AtendimentoNotificationSettings = {
  soundEnabled: boolean;
  soundOnlyWhenTabHidden: boolean;
  desktopNotificationsEnabled: boolean;
};

export const DEFAULT_ATENDIMENTO_NOTIFICATION_SETTINGS: AtendimentoNotificationSettings = {
  soundEnabled: true,
  soundOnlyWhenTabHidden: false,
  desktopNotificationsEnabled: false,
};

export function loadAtendimentoNotificationSettings(): AtendimentoNotificationSettings {
  if (typeof window === "undefined") return DEFAULT_ATENDIMENTO_NOTIFICATION_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ATENDIMENTO_NOTIFICATION_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AtendimentoNotificationSettings>;
    return { ...DEFAULT_ATENDIMENTO_NOTIFICATION_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_ATENDIMENTO_NOTIFICATION_SETTINGS;
  }
}

export function saveAtendimentoNotificationSettings(settings: AtendimentoNotificationSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(ATENDIMENTO_NOTIFICATION_SETTINGS_EVENT));
}

export function shouldPlayInboundChime(
  settings: AtendimentoNotificationSettings = loadAtendimentoNotificationSettings(),
) {
  if (!settings.soundEnabled) return false;
  if (settings.soundOnlyWhenTabHidden && typeof document !== "undefined" && !document.hidden) {
    return false;
  }
  return true;
}

export async function requestAtendimentoDesktopNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

export function showAtendimentoDesktopNotification(options: {
  title: string;
  body: string;
  tag?: string;
  chatId?: string;
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const notification = new Notification(options.title, {
      body: options.body,
      tag: options.tag,
      icon: "/favicon.ico",
    });
    if (options.chatId) {
      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        const path = `/painel/atendimento/conversas?c=${encodeURIComponent(options.chatId!)}`;
        if (window.location.pathname.startsWith("/painel/atendimento/conversas")) {
          window.dispatchEvent(
            new CustomEvent(ATENDIMENTO_OPEN_CONVERSATION_EVENT, {
              detail: { chatId: options.chatId },
            }),
          );
        } else {
          window.location.assign(path);
        }
        notification.close();
      };
    }
  } catch {
    // permissao revogada ou ambiente restrito
  }
}

export function maybeNotifyInboundMessage(
  qc: QueryClient,
  chatId: string,
  preview: string,
  settings: AtendimentoNotificationSettings = loadAtendimentoNotificationSettings(),
) {
  if (shouldPlayInboundChime(settings)) {
    playAtendimentoInboundChime();
  }

  if (!settings.desktopNotificationsEnabled) return;
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const conversations = qc.getQueryData<WabaConversation[]>(["atendimento-conversations"]);
  const conv = conversations?.find((c) => c.id === chatId);
  const name = conv?.contact?.name?.trim() || conv?.contact?.phone?.trim() || "Nova conversa";

  showAtendimentoDesktopNotification({
    title: name,
    body: preview || "Nova mensagem recebida",
    tag: `atendimento-${chatId}`,
    chatId,
  });
}

export function useAtendimentoNotificationSettings() {
  const [settings, setSettings] = useState(loadAtendimentoNotificationSettings);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    const sync = () => setSettings(loadAtendimentoNotificationSettings());
    window.addEventListener(ATENDIMENTO_NOTIFICATION_SETTINGS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ATENDIMENTO_NOTIFICATION_SETTINGS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (synced) return;
    void fetchStaffAtendimentoNotificationPrefsServer()
      .then((remote) => {
        if (!remote) return;
        const merged = { ...DEFAULT_ATENDIMENTO_NOTIFICATION_SETTINGS, ...remote };
        saveAtendimentoNotificationSettings(merged);
        setSettings(merged);
      })
      .catch((error) => {
        console.error("[atendimento prefs]", error);
      })
      .finally(() => setSynced(true));
  }, [synced]);

  const update = useCallback((patch: Partial<AtendimentoNotificationSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveAtendimentoNotificationSettings(next);
      void saveStaffAtendimentoNotificationPrefsServer({ data: next }).catch((error) => {
        console.error("[atendimento prefs sync]", error);
      });
      return next;
    });
  }, []);

  return { settings, update };
}
