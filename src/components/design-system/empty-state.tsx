import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E5E7EB] bg-white px-6 py-12 text-center">
      <p className="text-base font-medium text-[#111111]">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-[#6B7280]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
