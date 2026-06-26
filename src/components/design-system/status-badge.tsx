import { cn } from "@/lib/utils";

const tones = {
  default: "bg-[#F6F7F9] text-[#6B7280]",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
  info: "bg-sky-50 text-sky-700",
  primary: "bg-[var(--tenant-primary,#FF7A00)]/10 text-[var(--tenant-primary,#FF7A00)]",
} as const;

export function StatusBadge({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
