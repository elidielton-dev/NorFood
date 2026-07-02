import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

export function ConfiguracoesPageFrame({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex flex-col gap-3 border-b border-[#E5E7EB] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-[#1F2937]">{title}</h1>
          {description ? <p className="mt-1 text-sm text-[#6B7280]">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function ConfigSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#E5E7EB] bg-white">
      <div className="border-b border-[#E5E7EB] px-5 py-4">
        <h2 className="text-base font-semibold text-[#1F2937]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[#6B7280]">{description}</p> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function ConfigSettingRow({
  description,
  control,
  className,
}: {
  description: string;
  control: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-[#F3F4F6] py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="max-w-xl text-sm text-[#4B5563]">{description}</p>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function ConfigSwitchRow({
  description,
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  description: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <ConfigSettingRow
      description={description}
      control={
        <label className="flex cursor-pointer items-center gap-2.5">
          <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
          <span className="text-sm font-medium text-[#374151]">{label}</span>
        </label>
      }
    />
  );
}

export function ConfigCheckboxRow({
  description,
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  description: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <ConfigSettingRow
      description={description}
      control={
        <label className="flex cursor-pointer items-center gap-2.5">
          <Checkbox checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
          <span className="text-sm font-medium text-[#374151]">{label}</span>
        </label>
      }
    />
  );
}
