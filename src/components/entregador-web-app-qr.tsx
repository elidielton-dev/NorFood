import QRCode from "qrcode";
import { Copy, QrCode, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GestaoButton } from "@/components/gestao-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function getEntregadorWebAppUrl() {
  if (typeof window !== "undefined" && window.location.origin) {
    return `${window.location.origin}/entregador`;
  }
  return "/entregador";
}

function useEntregadorQrDataUrl(url: string) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
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

export function EntregadorWebAppQrPanel({
  className,
  compact = false,
  riderName,
}: {
  className?: string;
  compact?: boolean;
  riderName?: string;
}) {
  const appUrl = useMemo(() => getEntregadorWebAppUrl(), []);
  const qrDataUrl = useEntregadorQrDataUrl(appUrl);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(appUrl);
      toast.success("Link copiado.");
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
      <div className={cn("flex gap-4", compact ? "flex-col items-center text-center" : "flex-col lg:flex-row lg:items-start")}>
        <div className="mx-auto shrink-0 rounded-2xl border border-[color:var(--honey-line)] bg-white p-3 shadow-soft lg:mx-0">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR Code app entregador"
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">App entregador</p>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-[color:var(--gestao-ink)]">
            {riderName ? `Acesso de ${riderName}` : "Escaneie para abrir no celular"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            O entregador abre o link, faz login com e-mail e senha cadastrados e acompanha as
            entregas em tempo real.
          </p>

          <div className="mt-4 rounded-2xl border border-[color:var(--honey-line)] bg-background px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Link</p>
            <p className="mt-1 break-all text-sm font-medium text-[color:var(--gestao-ink)]">{appUrl}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <GestaoButton variant="secondary" size="sm" onClick={() => void copyLink()}>
              <Copy className="size-3.5" />
              Copiar link
            </GestaoButton>
            <a
              href={appUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-[color:var(--honey-line)] bg-background px-3 text-xs font-semibold transition hover:bg-muted/50"
            >
              Abrir app
            </a>
          </div>

          {!compact ? (
            <ol className="mt-4 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
              <li>Escaneie o QR Code com a camera do celular.</li>
              <li>Abra o link no navegador.</li>
              <li>Entre com o e-mail e senha do entregador.</li>
            </ol>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EntregadorWebAppQrDialog({
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
          <DialogTitle>App do entregador</DialogTitle>
          <DialogDescription>
            {riderName
              ? `Mostre este QR para ${riderName} acessar o app e fazer login.`
              : "Escaneie para abrir o app web do entregador."}
          </DialogDescription>
        </DialogHeader>
        <EntregadorWebAppQrPanel compact riderName={riderName} />
      </DialogContent>
    </Dialog>
  );
}
