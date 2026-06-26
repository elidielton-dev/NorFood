export function LoadingState({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <div className="size-8 animate-spin rounded-full border-2 border-[var(--tenant-primary,#FF7A00)] border-t-transparent" />
      <p className="text-sm text-[#6B7280]">{label}</p>
    </div>
  );
}
