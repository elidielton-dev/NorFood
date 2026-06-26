/** Tenant de demonstração / showcase da plataforma */
export const NORFOOD_DEMO_TENANT_ID = "a0000000-0000-4000-8000-000000000001";
export const NORFOOD_DEMO_TENANT_SLUG = "norfood";

/** Tenant exemplo de cliente (restaurante piloto) */
export const DEMO_RESTAURANT_TENANT_ID = "a0000000-0000-4000-8000-000000000002";
export const DEMO_RESTAURANT_TENANT_SLUG = "demo-restaurante";

export const DEFAULT_TENANT_SLUG = NORFOOD_DEMO_TENANT_SLUG;

export const TENANT_ID_BY_SLUG: Record<string, string> = {
  [NORFOOD_DEMO_TENANT_SLUG]: NORFOOD_DEMO_TENANT_ID,
  [DEMO_RESTAURANT_TENANT_SLUG]: DEMO_RESTAURANT_TENANT_ID,
};

export const TENANT_SLUG_BY_ID: Record<string, string> = {
  [NORFOOD_DEMO_TENANT_ID]: NORFOOD_DEMO_TENANT_SLUG,
  [DEMO_RESTAURANT_TENANT_ID]: DEMO_RESTAURANT_TENANT_SLUG,
};

/** @deprecated use NORFOOD_DEMO_TENANT_ID */
export const NORFOOD_TENANT_ID = NORFOOD_DEMO_TENANT_ID;
/** @deprecated use NORFOOD_DEMO_TENANT_SLUG */
export const NORFOOD_TENANT_SLUG = NORFOOD_DEMO_TENANT_SLUG;
