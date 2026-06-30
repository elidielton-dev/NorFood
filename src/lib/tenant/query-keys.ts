/** Chaves React Query sempre escopadas ao restaurante atual. */
export function tenantQueryKey(base: string, tenantSlug: string) {
  return [base, tenantSlug] as const;
}
