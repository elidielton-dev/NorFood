import { createFileRoute, useParams } from "@tanstack/react-router";
import { resolveTenantPainelPage } from "@/lib/tenant/tenant-painel-registry";

export const Route = createFileRoute("/t/$tenantSlug/$")({
  ssr: false,
  component: TenantPainelPage,
});

function TenantPainelPage() {
  const params = useParams({ strict: false }) as { _splat?: string; "*"?: string };
  const splat = params._splat ?? params["*"] ?? "dashboard";
  const Page = resolveTenantPainelPage(splat);
  return <Page />;
}
