/** Converte redirect de login (path ou URL completa) em path interno seguro. */
export function sanitizeLoginRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;

  let candidate = value.trim();

  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      candidate = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return undefined;
    }
  }

  if (!candidate.startsWith("/") || candidate.startsWith("//")) return undefined;
  if (candidate.includes("://")) return undefined;

  return candidate;
}

export function currentPathForLoginRedirect(pathname: string, searchStr = ""): string {
  return `${pathname}${searchStr}`;
}

/** Navegação confiável para paths internos (TanStack `to` não aceita URL já resolvida). */
export function followInternalRedirect(destination: string) {
  if (typeof window === "undefined") return;
  const path = sanitizeLoginRedirect(destination) ?? "/";
  window.location.assign(path);
}

/** Converte path interno em opções de redirect do TanStack Router. */
export function internalPathToRouterRedirect(destination: string) {
  const path = sanitizeLoginRedirect(destination) ?? "/";
  const [pathname, searchPart] = path.split("?");
  const search = searchPart
    ? (Object.fromEntries(new URLSearchParams(searchPart)) as Record<string, unknown>)
    : undefined;

  const tenantPainel = pathname.match(/^\/t\/([^/]+)\/?(.*)$/);
  if (tenantPainel) {
    const tenantSlug = tenantPainel[1];
    const splat = (tenantPainel[2] || "dashboard").replace(/\/$/, "");
    return {
      to: "/t/$tenantSlug/$" as const,
      params: { tenantSlug, _splat: splat },
      search,
    };
  }

  const aguardando = pathname.match(/^\/cadastro\/aguardando\/([^/]+)$/);
  if (aguardando) {
    return {
      to: "/cadastro/aguardando/$slug" as const,
      params: { slug: aguardando[1] },
      search,
    };
  }

  const suspensa = pathname.match(/^\/conta-suspensa\/([^/]+)$/);
  if (suspensa) {
    return {
      to: "/conta-suspensa/$slug" as const,
      params: { slug: suspensa[1] },
      search,
    };
  }

  const loja = pathname.match(/^\/loja\/([^/]+)$/);
  if (loja) {
    return {
      to: "/loja/$tenantSlug" as const,
      params: { tenantSlug: loja[1] },
      search,
    };
  }

  const entregador = pathname.match(/^\/entregador\/([^/]+)\/?(.*)$/);
  if (entregador) {
    const tenantSlug = entregador[1];
    const rest = entregador[2] || "dashboard";
    return {
      to: "/entregador/$tenantSlug/$" as const,
      params: { tenantSlug, _splat: rest },
      search,
    };
  }

  return { to: pathname as "/", search };
}
