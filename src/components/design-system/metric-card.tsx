import type { ReactNode } from "react";
import { cn } from "@/lib/shared/utils";
import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-[#111111]">{value}</p>
          {hint ? <p className="mt-1 text-xs text-[#6B7280]">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className="grid size-10 place-items-center rounded-lg bg-[var(--tenant-primary,#FF7A00)]/10 text-[var(--tenant-primary,#FF7A00)]">
            <Icon className="size-5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
