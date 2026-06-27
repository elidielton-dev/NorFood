import { createFileRoute } from "@tanstack/react-router";
import { resolvePlatformAdminFromBearerToken } from "@/lib/platform-admin/auth.server";
import {
  computeBillingSummary,
  generateBillingInvoicesForPeriod,
  loadAdminBillingRows,
  loadBillingInvoicesForPeriod,
} from "@/lib/api/platform-billing.functions";

function formatUnknownError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

function parsePeriod(url: URL) {
  const now = new Date();
  const year = Number(url.searchParams.get("year") ?? now.getFullYear());
  const month = Number(url.searchParams.get("month") ?? now.getMonth() + 1);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

async function requireAdmin(request: Request) {
  const session = await resolvePlatformAdminFromBearerToken(request.headers.get("authorization"));
  if (!session.userId) {
    return Response.json(
      { error: "Faça login novamente para acessar o faturamento." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  if (!session.allowed) {
    return Response.json(
      { error: "Acesso negado: apenas administradores da plataforma." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  return null;
}

export const Route = createFileRoute("/api/platform-admin/billing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await requireAdmin(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const period = parsePeriod(url);
        if (!period) {
          return Response.json({ error: "Período inválido." }, { status: 400 });
        }

        const view = url.searchParams.get("view") ?? "rows";
        try {
          if (view === "summary") {
            const rows = await loadAdminBillingRows(period.year, period.month);
            return Response.json(computeBillingSummary(rows), {
              headers: { "cache-control": "no-store" },
            });
          }
          if (view === "invoices") {
            const invoices = await loadBillingInvoicesForPeriod(period.year, period.month);
            return Response.json(invoices, { headers: { "cache-control": "no-store" } });
          }

          const rows = await loadAdminBillingRows(period.year, period.month);
          return Response.json(rows, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          const message = formatUnknownError(error, "Erro ao carregar faturamento.");
          console.error("[platform-admin/billing GET]", message, error);
          return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
        }
      },
      POST: async ({ request }) => {
        const denied = await requireAdmin(request);
        if (denied) return denied;

        let body: { year?: number; month?: number; markPending?: boolean } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
        }

        const now = new Date();
        const year = body.year ?? now.getFullYear();
        const month = body.month ?? now.getMonth() + 1;
        if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
          return Response.json({ error: "Período inválido." }, { status: 400 });
        }

        try {
          const result = await generateBillingInvoicesForPeriod(
            year,
            month,
            body.markPending ?? true,
          );
          return Response.json(result, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          const message = formatUnknownError(error, "Erro ao gerar faturas.");
          console.error("[platform-admin/billing POST]", message, error);
          return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
