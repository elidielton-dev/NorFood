/** Detecta falha de carregamento de chunk (comum com bloqueadores de anúncios/rastreadores). */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("dynamically imported module")
  );
}

export type SafeImportResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown; blockedByClient: boolean };

export async function safeDynamicImport<T>(
  loader: () => Promise<T>,
): Promise<SafeImportResult<T>> {
  try {
    const value = await loader();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error, blockedByClient: isChunkLoadError(error) };
  }
}
