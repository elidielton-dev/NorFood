import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Component, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import {
  Bell,
  Copy,
  FileText,
  Loader2,
  RefreshCw,
  QrCode,
  Save,
  Smartphone,
  Volume2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  ConfigSection,
  ConfigSettingRow,
  ConfigSwitchRow,
  ConfiguracoesPageFrame,
} from "@/components/configuracoes/configuracoes-page-frame";
import { GestaoAlert, GestaoButton, GestaoInput } from "@/components/gestao-ui";
import { cn } from "@/lib/utils";
import {
  formatPhoneInput,
  formatPairingCodeDisplay,
  formatPairingCodePlain,
  PAIRING_CODE_TTL_SECONDS,
} from "@/lib/whatsapp";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  connectAtendimentoEvolutionServer,
  consolidateEvolutionInboxServer,
  disconnectAtendimentoEvolutionServer,
  fetchAtendimentoConfigServer,
  fetchWabaCoexistenceStatusServer,
  fetchWabaTemplatesServer,
  fetchAtendimentoStatsServer,
  hardResetAtendimentoEvolutionServer,
  saveAtendimentoMetaConfigServer,
  setAtendimentoProviderServer,
  syncWabaTemplatesServer,
  triggerWabaCoexistenceSyncServer,
} from "@/lib/api/atendimento.functions";
import { playAtendimentoInboundChime } from "@/lib/atendimento/inbound-chime";
import {
  requestAtendimentoDesktopNotificationPermission,
  showAtendimentoDesktopNotification,
  useAtendimentoNotificationSettings,
} from "@/lib/atendimento/notification-settings";
import { META_DEVELOPER_APP } from "@/lib/meta/developer-app";
import type { AtendimentoProvider } from "@/lib/waba/types";
import { atendimento } from "@/components/atendimento/atendimento-ui";

type SettingsSection = "whatsapp" | "templates" | "notificacoes";

const SECTIONS: { id: SettingsSection; label: string; icon: typeof Wifi }[] = [
  { id: "whatsapp", label: "Conexão WhatsApp", icon: Wifi },
  { id: "notificacoes", label: "Notificações", icon: Bell },
  { id: "templates", label: "Templates", icon: FileText },
];

export function AtendimentoConfiguracoes() {
  const [section, setSection] = useState<SettingsSection>("whatsapp");

  return (
    <ConfiguracoesPageFrame
      title="WhatsApp / atendimento"
      description="Conexão Meta ou WhatsApp Web (Baileys), notificações e templates. Histórico das conversas: últimos 7 dias."
    >
      <AtendimentoStatsBar />

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <nav
          aria-label="Seções de configuração"
          className={cn(
            "flex gap-1 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "border-b border-[#E5E7EB]",
            "lg:sticky lg:top-0 lg:flex-col lg:overflow-visible lg:border-b-0 lg:pb-0",
          )}
        >
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors lg:w-full",
                  active
                    ? "bg-[#FFF7ED] text-[var(--tenant-primary,#FF7A00)]"
                    : "text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#374151]",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {section === "whatsapp" ? (
            <WhatsAppPanelErrorBoundary>
              <WhatsAppPanel />
            </WhatsAppPanelErrorBoundary>
          ) : section === "notificacoes" ? (
            <NotificacoesPanel />
          ) : (
            <TemplatesPanel />
          )}
        </div>
      </div>
    </ConfiguracoesPageFrame>
  );
}

function AtendimentoStatsBar() {
  const { data } = useQuery({
    queryKey: ["atendimento-stats"],
    queryFn: () => fetchAtendimentoStatsServer(),
  });

  if (!data) return null;

  return (
    <ConfigSection title="Resumo" description="Indicadores do atendimento nos últimos 7 dias.">
      <ConfigSettingRow
        description="Conversas ainda em atendimento no painel."
        control={
          <span className="text-lg font-semibold text-[#111111]">{data.openConversations}</span>
        }
      />
      <ConfigSettingRow
        description="Mensagens recebidas de clientes no período."
        control={
          <span className="text-lg font-semibold text-[#111111]">{data.inboundMessages7d}</span>
        }
      />
      <ConfigSettingRow
        description="Respostas automáticas enviadas pelo sistema."
        control={
          <span className="text-lg font-semibold text-[#111111]">{data.automationsSent7d}</span>
        }
      />
    </ConfigSection>
  );
}

class WhatsAppPanelErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[WhatsAppPanel]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <GestaoAlert tone="warning">
          <p className="text-sm">
            Nao foi possivel carregar a configuracao do WhatsApp.
            {this.state.error.message ? ` ${this.state.error.message}` : ""}
          </p>
          <GestaoButton
            className="mt-3"
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => this.setState({ error: null })}
          >
            Tentar novamente
          </GestaoButton>
        </GestaoAlert>
      );
    }
    return this.props.children;
  }
}

function WhatsAppPanel() {
  const qc = useQueryClient();
  const [providerChoice, setProviderChoice] = useState<AtendimentoProvider>("meta");

  const {
    data: config,
    isLoading,
    isError,
    error: configError,
    refetch,
  } = useQuery({
    queryKey: ["atendimento-config"],
    queryFn: () => fetchAtendimentoConfigServer(),
    retry: 1,
    throwOnError: false,
    refetchInterval: (q) => {
      const evo = q.state.data?.baileys ?? q.state.data?.evolution;
      if (evo?.status === "pairing" && !evo.pairingCode) return 4_000;
      if (evo?.status === "pairing") return 4_000;
      if (evo?.status === "qr" && !evo.qrCode) return 4_000;
      if (evo?.status === "qr" && evo.qrCode) return 3_000;
      if (evo?.status === "connecting") return 3_000;
      return false;
    },
  });

  const [form, setForm] = useState({
    phone_number_id: "",
    waba_id: "",
    access_token: "",
    verify_token: META_DEVELOPER_APP.verifyToken,
    pin: "",
    coexistence_mode: true,
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (config?.active_provider) setProviderChoice(config.active_provider);
  }, [config?.active_provider]);

  const { data: coexistence, refetch: refetchCoexistence } = useQuery({
    queryKey: ["waba-coexistence"],
    queryFn: () => fetchWabaCoexistenceStatusServer(),
    enabled: providerChoice === "meta" && Boolean(config?.connected),
  });

  const providerMutation = useMutation({
    mutationFn: (provider: AtendimentoProvider) =>
      setAtendimentoProviderServer({ data: { provider } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["atendimento-config"] }),
  });

  const syncMutation = useMutation({
    mutationFn: () => triggerWabaCoexistenceSyncServer({ data: { which: "contacts" } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["waba-coexistence"] });
      void qc.invalidateQueries({ queryKey: ["atendimento-conversations"] });
    },
  });

  const connectEvolutionMutation = useMutation({
    mutationFn: (input?: string | { phone: string; renew?: boolean }) => {
      if (!input) return connectAtendimentoEvolutionServer({ data: {} });
      if (typeof input === "string") {
        return connectAtendimentoEvolutionServer({ data: { phone: input } });
      }
      return connectAtendimentoEvolutionServer({
        data: { phone: input.phone, renew: input.renew },
      });
    },
    onSuccess: (data, variables) => {
      void qc.invalidateQueries({ queryKey: ["atendimento-config"] });
      void qc.invalidateQueries({ queryKey: ["atendimento-conversations"] });
      const warn = data?.baileys?.warning ?? data?.evolution?.warning;
      if (warn?.includes("Gerando")) {
        toast.info(warn);
      } else if (warn) {
        toast.warning(warn);
      } else if (typeof variables === "object" && variables?.renew) {
        toast.success("Novo codigo de vinculo gerado.");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao conectar o WhatsApp.");
    },
  });

  const disconnectEvolutionMutation = useMutation({
    mutationFn: () => disconnectAtendimentoEvolutionServer({ data: {} }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["atendimento-config"] });
      void qc.invalidateQueries({ queryKey: ["atendimento-conversations"] });
      const warn = data?.baileys?.warning ?? data?.evolution?.warning;
      if (warn) {
        toast.warning(warn);
      } else {
        toast.success("WhatsApp desconectado.");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao desconectar o WhatsApp.");
    },
  });

  const hardResetEvolutionMutation = useMutation({
    mutationFn: () => hardResetAtendimentoEvolutionServer({ data: {} }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["atendimento-config"] });
      void qc.invalidateQueries({ queryKey: ["atendimento-conversations"] });
      const warn = data?.baileys?.warning ?? data?.evolution?.warning;
      if (warn) toast.warning(warn);
      else toast.success("Conexao zerada. Gere um novo QR Code.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao zerar a conexao.");
    },
  });

  const consolidateInboxMutation = useMutation({
    mutationFn: () => consolidateEvolutionInboxServer({ data: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["atendimento-conversations"] });
    },
  });

  useEffect(() => {
    if (!config) return;
    setForm((f) => ({
      ...f,
      phone_number_id: config.phone_number_id ?? f.phone_number_id,
      waba_id: config.waba_id ?? f.waba_id,
      verify_token: config.form_verify_token ?? f.verify_token,
      coexistence_mode: config.coexistence_mode ?? f.coexistence_mode,
    }));
  }, [
    config?.phone_number_id,
    config?.waba_id,
    config?.form_verify_token,
    config?.coexistence_mode,
  ]);

  const saveMutation = useMutation({
    mutationFn: () => saveAtendimentoMetaConfigServer({ data: form }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["atendimento-config"] });
      void qc.invalidateQueries({ queryKey: ["waba-coexistence"] });
      void qc.invalidateQueries({ queryKey: ["atendimento-conversations"] });
    },
  });

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/waba/webhook`
      : META_DEVELOPER_APP.webhookUrl;

  const evolutionWebhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/whatsapp/webhook`
      : `${META_DEVELOPER_APP.siteUrl}/api/whatsapp/webhook`;

  async function copyWebhook(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-sage" />
      </div>
    );
  }

  if (isError) {
    return (
      <GestaoAlert tone="warning">
        <p className="text-sm">
          Nao foi possivel carregar a configuracao do WhatsApp.
          {configError instanceof Error ? ` ${configError.message}` : ""}
        </p>
        <GestaoButton className="mt-3" variant="secondary" size="sm" onClick={() => refetch()}>
          Tentar novamente
        </GestaoButton>
      </GestaoAlert>
    );
  }

  const inboxConnected = config?.inbox_connected ?? false;
  const evolution = config?.baileys ?? config?.evolution;
  const activeProvider = config?.active_provider ?? providerChoice;

  return (
    <div className="space-y-6">
      <ConfigSection title="Status da conexão" description="Situação atual do WhatsApp no painel.">
        <div className="flex items-start gap-3">
          {inboxConnected ? (
            <Wifi className="mt-0.5 size-5 shrink-0 text-[var(--tenant-primary,#FF7A00)]" />
          ) : (
            <WifiOff className="mt-0.5 size-5 shrink-0 text-destructive" />
          )}
          <div>
            <p className="font-semibold text-[#111111]">
              {inboxConnected
                ? `Conectado · ${config?.provider_label ?? activeProvider}`
                : "Desconectado"}
            </p>
            <p className="mt-1 text-sm text-[#6B7280]">
              {activeProvider === "meta"
                ? (config?.display_phone_number ?? config?.phone_number_id ?? "Meta Cloud API")
                : (evolution?.phoneNumber ?? evolution?.profileName ?? "WhatsApp Web (Baileys)")}
            </p>
            <p className="mt-1 text-xs text-[#6B7280]">
              O painel exibe o histórico dos últimos 7 dias. Conversas encerradas vão para
              Resolvidos.
            </p>
          </div>
        </div>
      </ConfigSection>

      <ConfigSection
        title="Modo de conexão"
        description="Escolha como conectar o WhatsApp da loja. Use um modo por vez."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                id: "meta" as const,
                title: "Meta Cloud API",
                desc: "API oficial. Requer app Meta e token permanente.",
              },
              {
                id: "baileys" as const,
                title: "WhatsApp Web (Baileys)",
                desc: "Sem Meta. Conecte via QR ou código no gateway Baileys na VPS.",
              },
            ] as const
          ).map((opt) => {
            const selected = providerChoice === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setProviderChoice(opt.id);
                  providerMutation.mutate(opt.id);
                }}
                className={cn(
                  "rounded-lg border p-4 text-left transition",
                  selected
                    ? "border-[var(--tenant-primary,#FF7A00)] bg-[#FFF7ED] ring-1 ring-[#FF7A00]/30"
                    : "border-[#E5E7EB] hover:bg-[#F9FAFB]",
                )}
              >
                <p className="font-medium text-[#111111]">{opt.title}</p>
                <p className="mt-1 text-xs text-[#6B7280]">{opt.desc}</p>
                {activeProvider === opt.id && inboxConnected ? (
                  <p className="mt-2 text-xs font-medium text-[var(--tenant-primary,#FF7A00)]">
                    Ativo agora
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      </ConfigSection>

      {(providerChoice === "baileys" || providerChoice === "evolution") ? (
        <EvolutionConnectPanel
          evolution={evolution}
          webhookUrl={evolutionWebhookUrl}
          copied={copied}
          onCopy={() => copyWebhook(evolutionWebhookUrl)}
          onConnect={(phone) => connectEvolutionMutation.mutate(phone)}
          onRenewPairing={(phone) => connectEvolutionMutation.mutate({ phone, renew: true })}
          onDisconnect={() => disconnectEvolutionMutation.mutate()}
          onHardReset={() => hardResetEvolutionMutation.mutate()}
          onRefresh={() => refetch()}
          onConsolidate={() => consolidateInboxMutation.mutate()}
          consolidating={consolidateInboxMutation.isPending}
          connecting={connectEvolutionMutation.isPending}
          disconnecting={disconnectEvolutionMutation.isPending}
          hardResetting={hardResetEvolutionMutation.isPending}
          error={
            connectEvolutionMutation.error instanceof Error
              ? connectEvolutionMutation.error.message
              : null
          }
        />
      ) : (
        <>
          <GestaoAlert tone="info">
            <strong>Webhook Meta:</strong> cadastre a URL abaixo no Meta for Developers.
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-muted px-2 py-1 text-xs">{webhookUrl}</code>
              <button
                type="button"
                className={cn(atendimento.outlineBtn, "px-2 py-1 text-xs")}
                onClick={() => copyWebhook(webhookUrl)}
              >
                <Copy className="size-3.5" />
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </GestaoAlert>

          <ConfigSection
            title="Coexistence — celular + painel"
            description="Use o WhatsApp Business no celular e no painel ao mesmo tempo (requer liberação Meta)."
          >
            <ConfigSwitchRow
              description="Não usa PIN /register. Histórico antigo não é importado no painel."
              label="Ativar modo Coexistence"
              checked={form.coexistence_mode}
              onCheckedChange={(coexistence_mode) => setForm((f) => ({ ...f, coexistence_mode }))}
            />

            {coexistence ? (
              <p className="border-t border-[#F3F4F6] pt-3 text-sm text-[#6B7280]">{coexistence.message}</p>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-[#F3F4F6] pt-4">
              <GestaoButton variant="secondary" size="sm" onClick={() => refetchCoexistence()}>
                <RefreshCw className="size-4" />
                Verificar status
              </GestaoButton>
              <GestaoButton
                variant="secondary"
                size="sm"
                disabled={!config?.connected || syncMutation.isPending}
                onClick={() => syncMutation.mutate()}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Sincronizar contatos
              </GestaoButton>
            </div>
          </ConfigSection>

          <ConfigSection
            title="Credenciais Meta"
            description="Phone Number ID, WABA ID e Access Token permanentes do app Meta."
          >
            <ConfigSettingRow
              description="Identificador do número de telefone no Meta for Developers."
              control={
                <GestaoInput
                  className="w-56"
                  value={form.phone_number_id}
                  onChange={(e) => setForm((f) => ({ ...f, phone_number_id: e.target.value }))}
                  placeholder="ID do número no Meta"
                />
              }
            />
            <ConfigSettingRow
              description="ID da conta WhatsApp Business (opcional)."
              control={
                <GestaoInput
                  className="w-56"
                  value={form.waba_id}
                  onChange={(e) => setForm((f) => ({ ...f, waba_id: e.target.value }))}
                  placeholder="WABA ID"
                />
              }
            />
            <ConfigSettingRow
              description="Token permanente gerado no app Meta com permissões de WhatsApp."
              control={
                <GestaoInput
                  type="password"
                  className="w-72"
                  value={form.access_token}
                  onChange={(e) => setForm((f) => ({ ...f, access_token: e.target.value }))}
                  placeholder="Token da API Meta"
                />
              }
            />
            <ConfigSettingRow
              description="Texto de verificação configurado no webhook do Meta."
              control={
                <GestaoInput
                  className="w-56"
                  value={form.verify_token}
                  onChange={(e) => setForm((f) => ({ ...f, verify_token: e.target.value }))}
                  placeholder="Verify token"
                />
              }
            />
            <ConfigSettingRow
              description="PIN de dois fatores do número. Não use em modo Coexistence."
              control={
                <GestaoInput
                  className="w-40"
                  value={form.pin}
                  onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
                  placeholder={form.coexistence_mode ? "Não usar" : "6 dígitos"}
                  disabled={form.coexistence_mode}
                />
              }
            />

            <div className="border-t border-[#F3F4F6] pt-4">
              <GestaoButton
                onClick={() => saveMutation.mutate()}
                disabled={
                  !form.phone_number_id ||
                  !form.access_token ||
                  !form.verify_token ||
                  saveMutation.isPending
                }
              >
                {saveMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Conectar Meta e salvar
              </GestaoButton>
            </div>

            {saveMutation.isError ? (
              <p className="text-sm text-destructive">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Erro ao salvar"}
              </p>
            ) : null}
            {saveMutation.isSuccess ? (
              <p className="text-sm text-[var(--tenant-primary,#FF7A00)]">
                Meta conectada. Webhook atualizado automaticamente.
              </p>
            ) : null}
          </ConfigSection>
        </>
      )}
    </div>
  );
}

function EvolutionConnectPanel({
  evolution,
  webhookUrl,
  copied,
  onCopy,
  onConnect,
  onRenewPairing,
  onDisconnect,
  onHardReset,
  onRefresh,
  onConsolidate,
  consolidating,
  connecting,
  disconnecting,
  hardResetting,
  error,
}: {
  evolution?: {
    configured: boolean;
    status: string;
    qrCode: string | null;
    pairingCode: string | null;
    connectMode?: "qr" | "pairing" | null;
    pairingIssuedAt?: string | null;
    evolutionOwnerPhone?: string | null;
    phoneNumber: string | null;
    profileName: string | null;
    connected: boolean;
    warning?: string | null;
  };
  webhookUrl: string;
  copied: boolean;
  onCopy: () => void;
  onConnect: (phone?: string) => void;
  onRenewPairing: (phone: string) => void;
  onDisconnect: () => void;
  onHardReset: () => void;
  onRefresh: () => void;
  onConsolidate: () => void;
  consolidating: boolean;
  connecting: boolean;
  disconnecting: boolean;
  hardResetting: boolean;
  error: string | null;
}) {
  const [connectMode, setConnectMode] = useState<"qr" | "phone">("qr");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [hardResetOpen, setHardResetOpen] = useState(false);
  const renewingRef = useRef(false);

  const waitingAuth = ["qr", "pairing", "connecting"].includes(evolution?.status ?? "");
  const serverConnectMode =
    evolution?.connectMode === "pairing" || evolution?.status === "pairing"
      ? "phone"
      : evolution?.connectMode === "qr" || evolution?.status === "qr"
        ? "qr"
        : null;

  useEffect(() => {
    if (serverConnectMode) setConnectMode(serverConnectMode);
  }, [serverConnectMode]);

  useEffect(() => {
    if (evolution?.phoneNumber) {
      setPhoneDraft(evolution.phoneNumber);
    }
  }, [evolution?.phoneNumber]);

  const showQr = connectMode === "qr" && Boolean(evolution?.qrCode && waitingAuth);
  const showPairing = connectMode === "phone" && Boolean(evolution?.pairingCode && waitingAuth);
  const qrPending =
    connectMode === "qr" &&
    !evolution?.connected &&
    (evolution?.status === "qr" || evolution?.status === "connecting") &&
    !evolution?.qrCode;
  const scanConfirmPending =
    connectMode === "qr" &&
    !evolution?.connected &&
    evolution?.status === "connecting" &&
    !evolution?.qrCode;
  const pairingPending =
    connectMode === "phone" &&
    !evolution?.connected &&
    (evolution?.status === "pairing" || evolution?.status === "connecting") &&
    !evolution?.pairingCode;

  const [pendingSeconds, setPendingSeconds] = useState(0);
  const [qrPendingSeconds, setQrPendingSeconds] = useState(0);

  useEffect(() => {
    if (!qrPending) {
      setQrPendingSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const tick = () => {
      setQrPendingSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [qrPending]);

  useEffect(() => {
    if (!pairingPending) {
      setPendingSeconds(0);
      return;
    }
    const startedAt = evolution?.pairingIssuedAt
      ? new Date(evolution.pairingIssuedAt).getTime()
      : Date.now();
    const tick = () => {
      setPendingSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [pairingPending, evolution?.pairingIssuedAt]);

  const pairingTimedOut = pairingPending && pendingSeconds >= 90;
  const qrTimedOut = qrPending && qrPendingSeconds >= 90;

  const resolvePairingPhone = useCallback(() => {
    const draftDigits = phoneDraft.replace(/\D/g, "");
    if (draftDigits.length >= 10) return draftDigits;
    const savedDigits = evolution?.phoneNumber?.replace(/\D/g, "") ?? "";
    return savedDigits.length >= 10 ? savedDigits : "";
  }, [phoneDraft, evolution?.phoneNumber]);

  const renewPairing = useCallback(() => {
    const phone = resolvePairingPhone();
    if (!phone || renewingRef.current || evolution?.connected || connecting) return;
    renewingRef.current = true;
    onRenewPairing(phone);
  }, [resolvePairingPhone, evolution?.connected, connecting, onRenewPairing]);

  useEffect(() => {
    if (!showPairing || !evolution?.pairingIssuedAt) {
      setSecondsLeft(null);
      return;
    }

    const issuedAt = evolution.pairingIssuedAt;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - new Date(issuedAt).getTime()) / 1000);
      const left = Math.max(0, PAIRING_CODE_TTL_SECONDS - elapsed);
      setSecondsLeft(left);
      if (left === 0) renewPairing();
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [showPairing, evolution?.pairingIssuedAt, evolution?.pairingCode, renewPairing]);

  useEffect(() => {
    if (!connecting) renewingRef.current = false;
  }, [connecting]);

  const otherModeActive =
    !evolution?.connected &&
    waitingAuth &&
    ((connectMode === "qr" && Boolean(evolution?.pairingCode)) ||
      (connectMode === "phone" && Boolean(evolution?.qrCode)));

  const showDisconnect = Boolean(
    evolution?.connected ||
    waitingAuth ||
    evolution?.warning?.toLowerCase().includes("sessao ativa"),
  );

  return (
    <div className="space-y-4">
      <GestaoAlert tone="info">
        <strong>Gateway WhatsApp (Baileys)</strong> na sua VPS. Configure{" "}
        <code className="text-xs">WHATSAPP_GATEWAY_URL</code> e{" "}
        <code className="text-xs">WHATSAPP_GATEWAY_KEY</code> no servidor.
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs">Webhook:</span>
          <code className="rounded-lg bg-muted px-2 py-1 text-xs">{webhookUrl}</code>
          <button
            type="button"
            className={cn(atendimento.outlineBtn, "px-2 py-1 text-xs")}
            onClick={onCopy}
          >
            <Copy className="size-3.5" />
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
      </GestaoAlert>

      <ConfigSection
        title="Conectar WhatsApp"
        description="Escaneie o QR Code ou use o número do celular com código de vinculo (igual WhatsApp Web)."
      >

        {evolution?.warning ? <p className="text-sm text-amber-800">{evolution.warning}</p> : null}

        {otherModeActive ? (
          <GestaoAlert tone="warning">
            {connectMode === "qr"
              ? "Ha um codigo de vinculo ativo. Clique em Gerar QR Code para trocar para escaneamento (o codigo atual sera cancelado)."
              : "Ha um QR Code ativo. Clique em Gerar codigo para trocar para numero + codigo (o QR atual sera cancelado)."}
          </GestaoAlert>
        ) : null}

        {!evolution?.connected ? (
          <div className="flex gap-1 rounded-lg bg-[color:var(--gestao-cream)]/50 p-1">
            <button
              type="button"
              onClick={() => setConnectMode("qr")}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-xs font-medium transition",
                connectMode === "qr"
                  ? "bg-card text-[color:var(--gestao-ink)] shadow-sm"
                  : "text-muted-foreground hover:text-[color:var(--gestao-ink)]",
              )}
            >
              QR Code
            </button>
            <button
              type="button"
              onClick={() => setConnectMode("phone")}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-xs font-medium transition",
                connectMode === "phone"
                  ? "bg-card text-[color:var(--gestao-ink)] shadow-sm"
                  : "text-muted-foreground hover:text-[color:var(--gestao-ink)]",
              )}
            >
              Numero + codigo
            </button>
          </div>
        ) : null}

        {qrPending && !qrTimedOut ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-[color:var(--honey-line)] bg-white p-6">
            <Loader2 className="size-9 animate-spin text-sage" />
            <p className="text-sm font-medium text-[color:var(--gestao-ink)]">Gerando QR Code...</p>
            <p className="text-center text-xs text-muted-foreground">
              Aguarde alguns segundos. Nao clique em Gerar QR Code novamente.
            </p>
            <p className="text-center text-xs text-muted-foreground tabular-nums">
              Aguardando ha {qrPendingSeconds}s
            </p>
          </div>
        ) : null}

        {qrTimedOut ? (
          <GestaoAlert tone="warning">
            <p className="text-sm">
              O gateway nao devolveu o QR Code apos 90 segundos. Clique em{" "}
              <strong>Desconectar</strong>, aguarde 10 segundos e clique em{" "}
              <strong>Gerar QR Code</strong> de novo.
            </p>
          </GestaoAlert>
        ) : null}

        {scanConfirmPending ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-[color:var(--honey-line)] bg-white p-6">
            <Loader2 className="size-9 animate-spin text-sage" />
            <p className="text-sm font-medium text-[color:var(--gestao-ink)]">
              QR escaneado? Aguardando confirmacao do WhatsApp...
            </p>
            <p className="text-center text-xs text-muted-foreground">
              Isso pode levar ate 30 segundos. Nao clique em Gerar QR Code novamente.
            </p>
          </div>
        ) : null}

        {evolution?.warning && !showQr && !qrTimedOut && !scanConfirmPending ? (
          <GestaoAlert tone="warning">
            <p className="text-sm">{evolution.warning}</p>
          </GestaoAlert>
        ) : null}

        {showQr ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-[color:var(--honey-line)] bg-white p-4">
            <img
              src={evolution!.qrCode!}
              alt="QR Code WhatsApp Baileys"
              className="size-56 max-w-full object-contain"
            />
            <p className="text-center text-sm text-muted-foreground">
              WhatsApp Business → Aparelhos conectados → Conectar aparelho → Escanear QR
            </p>
          </div>
        ) : null}

        {pairingPending && !pairingTimedOut ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-[color:var(--honey-line)] bg-white p-6">
            <Loader2 className="size-9 animate-spin text-sage" />
            <p className="text-sm font-medium text-[color:var(--gestao-ink)]">
              Gerando codigo de vinculo...
            </p>
            <p className="text-center text-xs text-muted-foreground">
              O gateway esta preparando a sessao. O codigo aparece aqui em alguns segundos.
            </p>
            <p className="text-center text-xs text-muted-foreground tabular-nums">
              Aguardando ha {pendingSeconds}s
            </p>
          </div>
        ) : null}

        {pairingTimedOut ? (
          <GestaoAlert tone="warning">
            <p className="text-sm">
              O gateway nao devolveu o codigo apos 90 segundos. Clique em{" "}
              <strong>Desconectar</strong>, aguarde 10 segundos e clique em{" "}
              <strong>Gerar codigo</strong> de novo.
            </p>
            <p className="mt-2 text-xs">
              Na VPS, atualize o <code className="text-[11px]">CONFIG_SESSION_PHONE_VERSION</code>{" "}
              para a versao atual do WhatsApp Web (formato{" "}
              <code className="text-[11px]">2.3000.x</code>, nao a versao do app no celular) e
              reinicie o container.
            </p>
          </GestaoAlert>
        ) : null}

        {showPairing ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-[color:var(--honey-line)] bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Codigo de vinculo
            </p>
            <p
              className={cn(
                "font-mono text-3xl font-bold tracking-widest text-[color:var(--gestao-ink)]",
                secondsLeft !== null && secondsLeft <= 10 && "text-destructive",
              )}
            >
              {formatPairingCodeDisplay(evolution!.pairingCode!)}
            </p>
            <p className="text-center text-xs text-muted-foreground">
              No celular, digite sem hifen:{" "}
              <strong className="font-mono">
                {formatPairingCodePlain(evolution!.pairingCode!)}
              </strong>
            </p>
            <p className="text-center text-sm text-muted-foreground">
              WhatsApp {evolution?.phoneNumber ? `(${evolution.phoneNumber})` : "do numero acima"} →
              Aparelhos conectados → Conectar aparelho → Conectar com numero de telefone.
            </p>
            <p className="text-center text-xs text-amber-700">
              {connecting ? (
                "Gerando novo codigo..."
              ) : secondsLeft !== null ? (
                secondsLeft > 0 ? (
                  <>
                    Expira em <strong className="tabular-nums">{secondsLeft}s</strong> — renova
                    sozinho ao zerar.
                  </>
                ) : (
                  "Renovando codigo..."
                )
              ) : (
                "Digite o codigo no celular assim que aparecer."
              )}
            </p>
            {evolution?.status === "pairing" ? (
              <p className="text-center text-xs text-muted-foreground">
                Aguardando confirmacao no celular. O painel atualiza sozinho quando conectar.
              </p>
            ) : null}
            <div className="w-full">
              <GestaoAlert tone="warning">
                <span className="text-xs">
                  Se o celular disser &quot;Nao foi possivel conectar/associar&quot;, atualize na
                  VPS o <code className="text-[11px]">CONFIG_SESSION_PHONE_VERSION</code> para uma
                  versao recente do WhatsApp Web (ex.:{" "}
                  <code className="text-[11px]">2.3000.1042056473</code>) e reinicie o container. A
                  versao em Ajuda no celular (ex. 2.26.x) e outro formato — nao use no .env. Ou use
                  a aba QR Code.
                </span>
              </GestaoAlert>
            </div>
            <GestaoButton
              variant="secondary"
              size="sm"
              onClick={renewPairing}
              disabled={connecting || !resolvePairingPhone()}
            >
              {connecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Renovar codigo
            </GestaoButton>
          </div>
        ) : null}

        {evolution?.connected ? (
          <p className="text-sm text-sage">
            Conectado
            {evolution.phoneNumber ? ` · ${evolution.phoneNumber}` : ""}
            {evolution.profileName ? ` (${evolution.profileName})` : ""}
          </p>
        ) : null}

        {!evolution?.connected &&
        connectMode === "phone" &&
        !showPairing &&
        (!pairingPending || pairingTimedOut) ? (
          <div className="space-y-2">
            <label className="text-sm font-medium text-[color:var(--gestao-ink)]">
              Numero do WhatsApp Business
            </label>
            <GestaoInput
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(formatPhoneInput(e.target.value))}
              placeholder="(87) 98158-2587"
              inputMode="tel"
            />
            <p className="text-xs text-muted-foreground">
              Use o mesmo numero do celular que vai receber o codigo (com DDI 55).
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!evolution?.connected ? (
            connectMode === "phone" ? (
              <GestaoButton
                onClick={() => onConnect(phoneDraft)}
                disabled={
                  connecting ||
                  !phoneDraft.trim() ||
                  (pairingPending && !pairingTimedOut)
                }
              >
                {connecting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Smartphone className="size-4" />
                )}
                Gerar codigo
              </GestaoButton>
            ) : (
              <GestaoButton
                onClick={() => onConnect()}
                disabled={connecting || (qrPending && !qrTimedOut)}
              >
                {connecting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <QrCode className="size-4" />
                )}
                Gerar QR Code
              </GestaoButton>
            )
          ) : null}
          {showDisconnect ? (
            <GestaoButton variant="secondary" onClick={onDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="size-4 animate-spin" /> : null}
              Desconectar
            </GestaoButton>
          ) : null}
          <GestaoButton variant="secondary" size="sm" onClick={onRefresh}>
            <RefreshCw className="size-4" />
            Atualizar status
          </GestaoButton>
          <GestaoButton
            variant="secondary"
            size="sm"
            type="button"
            disabled={hardResetting || connecting || disconnecting}
            onClick={() => setHardResetOpen(true)}
          >
            {hardResetting ? <Loader2 className="size-4 animate-spin" /> : null}
            Zerar conexao
          </GestaoButton>
          <AlertDialog open={hardResetOpen} onOpenChange={setHardResetOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Zerar conexao WhatsApp?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso desconecta o gateway, apaga todos os chats e mensagens do atendimento e
                  limpa a configuracao. Voce precisara escanear um novo QR Code depois.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setHardResetOpen(false);
                    onHardReset();
                  }}
                >
                  Zerar tudo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {evolution?.connected ? (
            <GestaoButton
              variant="secondary"
              size="sm"
              onClick={onConsolidate}
              disabled={consolidating}
            >
              {consolidating ? <Loader2 className="size-4 animate-spin" /> : null}
              Unir duplicatas
            </GestaoButton>
          ) : null}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!evolution?.configured ? (
          <p className="text-sm text-amber-800">
            Gateway WhatsApp nao detectado no servidor. Em producao, configure{" "}
            <code className="text-xs">WHATSAPP_GATEWAY_URL</code> e{" "}
            <code className="text-xs">WHATSAPP_GATEWAY_KEY</code> e suba o container{" "}
            <code className="text-xs">whatsapp-gateway</code>. Em desenvolvimento local, rode{" "}
            <code className="text-xs">npm run dev:whatsapp-gateway</code>.
          </p>
        ) : null}
      </ConfigSection>
    </div>
  );
}

function NotificacoesPanel() {
  const { settings, update } = useAtendimentoNotificationSettings();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  async function enableDesktopNotifications(checked: boolean) {
    if (!checked) {
      update({ desktopNotificationsEnabled: false });
      return;
    }
    const result = await requestAtendimentoDesktopNotificationPermission();
    setPermission(result);
    update({ desktopNotificationsEnabled: result === "granted" });
  }

  return (
    <ConfigSection
      title="Notificações"
      description="Som e alertas ao receber mensagens em outras conversas. Preferências sincronizadas com sua conta."
    >
      <ConfigSwitchRow
        description="Toca um sinal curto quando chega mensagem em uma conversa que não está aberta."
        label="Som ao receber mensagem"
        checked={settings.soundEnabled}
        onCheckedChange={(checked) => update({ soundEnabled: checked })}
      />
      <ConfigSwitchRow
        description="O som toca apenas quando você está em outra aba ou janela do navegador."
        label="Som só com aba em segundo plano"
        checked={settings.soundOnlyWhenTabHidden}
        onCheckedChange={(checked) => update({ soundOnlyWhenTabHidden: checked })}
        disabled={!settings.soundEnabled}
      />
      <ConfigSwitchRow
        description="Mostra alerta na área de notificações do sistema operacional."
        label="Notificações do navegador"
        checked={settings.desktopNotificationsEnabled}
        onCheckedChange={(checked) => void enableDesktopNotifications(checked)}
        disabled={permission === "unsupported"}
      />

      {permission === "denied" ? (
        <GestaoAlert tone="warning">
          As notificações do navegador estão bloqueadas. Libere nas configurações do site no
          navegador para usar alertas na área de trabalho.
        </GestaoAlert>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-[#F3F4F6] pt-4">
        <GestaoButton
          variant="secondary"
          size="sm"
          onClick={() => playAtendimentoInboundChime()}
          disabled={!settings.soundEnabled}
        >
          <Volume2 className="size-4" />
          Testar som
        </GestaoButton>
        <GestaoButton
          variant="secondary"
          size="sm"
          disabled={permission !== "granted" || !settings.desktopNotificationsEnabled}
          onClick={() =>
            showAtendimentoDesktopNotification({
              title: "Abelha & Mel",
              body: "Exemplo: nova mensagem de um cliente.",
              tag: "atendimento-test",
            })
          }
        >
          <Bell className="size-4" />
          Testar notificação
        </GestaoButton>
      </div>
    </ConfigSection>
  );
}

function TemplatesPanel() {
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["waba-templates"],
    queryFn: () => fetchWabaTemplatesServer(),
  });

  const syncMutation = useMutation({
    mutationFn: () => syncWabaTemplatesServer({ data: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["waba-templates"] });
    },
  });

  return (
    <ConfigSection
      title="Templates de mensagem"
      description="Modelos aprovados pela Meta para iniciar conversas fora da janela de 24h."
    >
      <div className="mb-4 flex justify-end">
        <GestaoButton
          type="button"
          variant="secondary"
          disabled={syncMutation.isPending}
          onClick={() => syncMutation.mutate()}
        >
          {syncMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Sincronizar Meta
        </GestaoButton>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-[var(--tenant-primary,#FF7A00)]" />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#E5E7EB] bg-[#F9FAFB] px-4 py-8 text-center">
          <FileText className="mx-auto size-8 text-[#9CA3AF]" />
          <p className="mt-2 text-sm text-[#6B7280]">
            Nenhum template sincronizado. Configure a Meta e clique em Sincronizar Meta.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#F3F4F6] rounded-lg border border-[#E5E7EB]">
          {templates.map((t: { id: string; name: string; status: string; language: string }) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium text-[#111111]">{t.name}</p>
                <p className="text-xs text-[#6B7280]">
                  {t.language} · {t.status}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
                  t.status === "APPROVED"
                    ? "bg-[#FFF7ED] text-[var(--tenant-primary,#FF7A00)]"
                    : "bg-[#F3F4F6] text-[#6B7280]",
                )}
              >
                {t.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ConfigSection>
  );
}
