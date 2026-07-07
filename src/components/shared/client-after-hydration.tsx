import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders children only after the client has mounted.
 * Avoids hydration mismatches when browser extensions mutate the SSR DOM
 * (e.g. Bitwarden adds `bis_skin_checked` to divs before React hydrates).
 */
export function ClientAfterHydration({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) return fallback;
  return children;
}
