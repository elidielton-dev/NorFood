import QRCode from "qrcode";
import { useQuery } from "@tanstack/react-query";
import { Copy, QrCode, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GestaoButton } from "@/components/painel/gestao-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/shared/utils";
import { resolveExpoGoUrl } from "@/lib/entregador/entregador-expo-go-url";

type ExpoGoUrlResponse = {
  url: string;
  type: "expo-go";
  instructions: string[];
};

async function fetchExpoGoUrl(): Promise<ExpoGoUrlResponse> {
  const res = await fetch("/api/entregador/expo-go-url");
  if (!res.ok) throw new Error("Nao foi possivel carregar URL do Expo Go.");
  return res.json() as Promise<ExpoGoUrlResponse>;
}

function useExpoGoQrDataUrl(url: string | undefined) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      color: { dark: "#223126", light: "#ffffff" },
    })
      .then((value) => {
        if (!cancelled) setDataUrl(value);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return dataUrl;
}

export function EntregadorExpoGoQrPanel({
  className,
  compact = false,
  riderName,
}: {
  className?: string;
  compact?: boolean;
  riderName?: string;
}) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["expo-go-url"],
    queryFn: fetchExpoGoUrl,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const fallbackUrl = resolveExpoGoUrl({
    expoGoUrl: import.meta.env.VITE_EXPO_GO_URL,
    metroHost: import.meta.env.VITE_EXPO_METRO_HOST,
    metroPort: import.meta.env.VITE_EXPO_METRO_PORT,
  });

  const expoUrl = data?.url || fallbackUrl;
  const qrDataUrl = useExpoGoQrDataUrl(expoUrl || undefined);

  async function copyLink() {
    if (!expoUrl) {
      toast.error("URL do Expo Go indisponivel.");
      return;
    }
    try {
      await navigator.clipboard.writeText(expoUrl);
      toast.success("Link Expo Go copiado.");
    } catch {
      toast.error("Nao foi possivel copiar o link.");
    }
  }

  return (
    <div
      className={cn(
        "rounded-3xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/45 p-4 sm:p-5",
        className,
      )}
    >
      <div
        className={cn(
          "flex gap-4",
          compact ? "flex-col items-center text-center" : "flex-col lg:flex-row lg:items-start",
        )}
      >
        <div className="mx-auto shrink-0 rounded-2xl border border-[color:var(--honey-line)] bg-white p-3 shadow-soft lg:mx-0">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR Code Expo Go"
              className="size-[220px] rounded-xl sm:size-[240px]"
            />
          ) : (
            <div className="flex size-[220px] items-center justify-center rounded-xl bg-muted sm:size-[240px]">
              <QrCode className="size-10 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[color:var(--gestao-green)]">
            <Smartphone className="size-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">Expo Go</p>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-[color:var(--gestao-ink)]">
            {riderName ? `App de ${riderName}` : "Escaneie com o Expo Go"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Abra o app <strong>Expo Go</strong> no celular, escaneie este QR e faça login com e-mail e
            senha do entregador.
          </p>

          {isLoading || isFetching ? (
            <p className="mt-3 text-sm text-muted-foreground">Carregando URL do Metro...</p>
          ) : null}
          {isError || !expoUrl ? (
            <p className="mt-3 text-sm text-amber-700">
              Nao foi possivel obter a URL do Expo Go. O Metro pode estar reiniciando — aguarde e
              atualize.
            </p>
          ) : null}

          <div className="mt-4 rounded-2xl border border-[color:var(--honey-line)] bg-background px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              Link Expo Go
            </p>
            <p className="mt-1 break-all text-sm font-medium text-[color:var(--gestao-ink)]">
              {expoUrl}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <GestaoButton variant="secondary" size="sm" onClick={() => void refetch()}>
              Atualizar QR
            </GestaoButton>
            <GestaoButton
              variant="secondary"
              size="sm"
              onClick={() => void copyLink()}
              disabled={!expoUrl}
            >
              <Copy className="size-3.5" />
              Copiar link
            </GestaoButton>
          </div>

          {!compact ? (
            <ol className="mt-4 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
              {(data?.instructions ?? [
                "Instale o Expo Go (App Store / Play Store).",
                "Abra o Expo Go e escaneie o QR (nao use a camera do iPhone).",
                "Entre com e-mail e senha do entregador.",
              ]).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EntregadorExpoGoQrDialog({
  open,
  onOpenChange,
  riderName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riderName?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Expo Go — app entregador</DialogTitle>
          <DialogDescription>
            {riderName
              ? `Mostre este QR para ${riderName} abrir no Expo Go.`
              : "Escaneie com o app Expo Go no celular."}
          </DialogDescription>
        </DialogHeader>
        <EntregadorExpoGoQrPanel compact riderName={riderName} />
      </DialogContent>
    </Dialog>
  );
}

// Compatibilidade com imports antigos
export { EntregadorExpoGoQrPanel as EntregadorWebAppQrPanel };
export { EntregadorExpoGoQrDialog as EntregadorWebAppQrDialog };
