import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { getAuthenticatedUser } from "@/lib/auth/auth-session";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { resolveLoginDestination } from "@/lib/auth/auth-roles";
import {
  followInternalRedirect,
  internalPathToRouterRedirect,
  sanitizeLoginRedirect,
} from "@/lib/auth/login-redirect";
import { NORFOOD_DEMO_TENANT_SLUG } from "@/lib/tenant/constants";
import { NorfoodLogo } from "@/components/brand/norfood-logo";

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: sanitizeLoginRedirect(search.redirect),
  }),
  head: () => ({
    meta: [{ title: "Entrar — Norfood" }],
  }),
  beforeLoad: async ({ search }) => {
    if (!isSupabaseConfigured()) return;
    const user = await getAuthenticatedUser();
    if (!user) return;
    const destination = await resolveLoginDestination(search.redirect);
    throw redirect(internalPathToRouterRedirect(destination));
  },
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();
  const isParceiroLogin = redirectTo === "/parceiro" || redirectTo?.startsWith("/parceiro/");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void (async () => {
      const user = await getAuthenticatedUser();
      if (!user) return;
      const destination = await resolveLoginDestination(redirectTo);
      followInternalRedirect(destination);
    })();
  }, [redirectTo]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        if (isParceiroLogin) {
          toast.error("Configure VITE_SUPABASE_URL no .env para acessar o portal parceiro.");
          return;
        }
        toast.success("Modo demo — entrando no painel...");
        nav({
          to: "/t/$tenantSlug/$",
          params: { tenantSlug: NORFOOD_DEMO_TENANT_SLUG, _splat: "dashboard" },
        });
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      await supabase.auth.getSession();
      toast.success("Bem-vindo(a) de volta!");
      const destination = await resolveLoginDestination(redirectTo);
      followInternalRedirect(destination);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro inesperado";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#F6F7F9] px-4">
      <Toaster richColors position="top-center" />
      <div className="w-full max-w-sm rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <NorfoodLogo size="lg" className="mb-3" />
          <h1 className="text-2xl font-semibold text-[#111111]">
            {isParceiroLogin ? "Portal Parceiro" : "Entrar"}
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            {!isSupabaseConfigured()
              ? isParceiroLogin
                ? "Supabase nao configurado neste ambiente — use deploy/.env e reinicie o servidor"
                : "Modo demo local — clique em Entrar para ir ao painel"
              : isParceiroLogin
                ? "Acesse o painel da sua revendedora NorFood"
                : "Acesse o painel da sua empresa"}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <input
            required
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none focus:border-[#FF9100] focus:ring-2 focus:ring-[#FF9100]/15"
          />
          <input
            required
            type="password"
            placeholder="Senha"
            value={senha}
            minLength={6}
            onChange={(e) => setSenha(e.target.value)}
            className="h-11 w-full rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none focus:border-[#FF9100] focus:ring-2 focus:ring-[#FF9100]/15"
          />
          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-lg bg-[#FF9100] text-sm font-medium text-white hover:bg-[#FF5C00] disabled:opacity-60"
          >
            {loading ? "Aguarde..." : "Entrar"}
          </button>
        </form>

        <div className="mt-5 space-y-2 text-center text-sm text-[#6B7280]">
          {isParceiroLogin ? (
            <Link to="/login" className="block hover:text-[#111111]">
              Entrar como restaurante
            </Link>
          ) : (
            <Link to="/login" search={{ redirect: "/parceiro" }} className="block hover:text-[#111111]">
              Sou revendedor NorFood
            </Link>
          )}
          <Link to="/cadastro" className="block hover:text-[#111111]">
            Criar conta
          </Link>
          <Link to="/recuperar-senha" className="block hover:text-[#111111]">
            Recuperar senha
          </Link>
          <Link to="/" className="block hover:text-[#111111]">
            ← Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
