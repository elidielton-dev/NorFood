import { ShieldAlert } from "lucide-react";

type ChunkLoadFallbackProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
};

export function ChunkLoadFallback({
  title = "Recurso bloqueado pelo navegador",
  description = "Seu bloqueador de anúncios ou proteção contra rastreadores impediu o carregamento desta parte do app. Desative o bloqueio para este site ou adicione uma exceção e tente novamente.",
  onRetry,
}: ChunkLoadFallbackProps) {
  return (
    <div className="rounded-2xl border border-dashed border-[color:var(--honey-line,#E5E7EB)] bg-background px-4 py-4 text-sm text-muted-foreground">
      <div className="flex gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-[color:var(--gold,#FF9100)]" />
        <div>
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-1 leading-relaxed">{description}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Tentar novamente
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
