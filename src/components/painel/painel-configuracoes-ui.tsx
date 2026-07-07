import { AlertCircle, CheckCircle2 } from "lucide-react";
import { GestaoCard, GestaoStat, StatusPill, gestao } from "@/components/painel/gestao-ui";
import { cn } from "@/lib/shared/utils";

export function PrinterStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return <GestaoStat label={label} value={value} hint={hint} className="!p-4" />;
}

export function ConfigBox({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(gestao.panel, "p-4 bg-[linear-gradient(180deg,#fff,#faf7f1)]")}>
      <p className={gestao.eyebrow}>{label}</p>
      <p className={cn("mt-2 text-base font-semibold", gestao.ink)}>{value}</p>
    </div>
  );
}

export function SettingRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2.5">
      <span className={cn("text-sm", gestao.ink)}>{label}</span>
      <StatusPill tone={enabled ? "success" : "neutral"}>
        {enabled ? "Ligado" : "Desligado"}
      </StatusPill>
    </div>
  );
}

export function StatusBadge({
  ativo,
  ativoLabel = "Configurado",
}: {
  ativo: boolean;
  ativoLabel?: string;
}) {
  if (ativo) {
    return (
      <StatusPill tone="success">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="size-3.5" />
          {ativoLabel}
        </span>
      </StatusPill>
    );
  }

  return (
    <StatusPill tone="warning">
      <span className="inline-flex items-center gap-1">
        <AlertCircle className="size-3.5" />
        Pendente
      </span>
    </StatusPill>
  );
}

export function ConfigDetailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <GestaoCard>
      <h3 className={cn("font-display text-xl sm:text-2xl", gestao.ink)}>{title}</h3>
      <div className="mt-4">{children}</div>
    </GestaoCard>
  );
}
