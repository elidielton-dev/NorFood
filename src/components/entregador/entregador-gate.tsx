import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Bike } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAuthenticatedSession } from "@/lib/auth/auth-session";
import {
  fetchCurrentUserRoles,
  isMotoboyRole,
  isStaffRole,
  type AppRole,
} from "@/lib/auth/auth-roles";
import { HoneyBackground } from "@/components/loja/honey-background";
import { EntregadorWebApp } from "@/components/entregador/entregador-web-app";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import logo from "@/assets/logo-norfood.png";

export function EntregadorGate() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function refreshSession() {
    const session = await getAuthenticatedSession();
    setUser(session?.user ?? null);
    if (session?.user) {
      setRoles(await fetchCurrentUserRoles());
    } else {
      setRoles([]);
    }
    setReady(true);
  }

  useEffect(() => {
    void refreshSession();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void refreshSession();
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      toast.success("Login realizado");
      await refreshSession();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel entrar");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setRoles([]);
  }

  if (!ready) {
    return (
      <div className="relative isolate grid min-h-screen place-items-center px-4">
        <HoneyBackground />
        <p className="relative z-10 text-sm text-muted-foreground">Carregando app do entregador...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative isolate min-h-screen overflow-hidden px-4 py-8">
        <HoneyBackground />
        <Toaster richColors position="top-center" />
        <div className="relative z-10 mx-auto w-full max-w-sm rounded-3xl border border-border bg-card/95 p-6 shadow-soft backdrop-blur-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <img src={logo} alt="NorFood" className="mb-3 h-16 w-auto max-w-[12rem] object-contain" />
            <h1 className="flex items-center gap-2 font-display text-2xl">
              <Bike className="size-5" /> Entregador
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Entre com o e-mail cadastrado para ver e aceitar entregas.
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              required
              type="email"
              placeholder="E-mail do entregador"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm"
            />
            <input
              required
              type="password"
              placeholder="Senha"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm"
            />
            <button
              type="submit"
              disabled={submitting}
              className="gradient-sage w-full rounded-full py-3 text-sm font-semibold text-primary-foreground disabled:opacity-70"
            >
              {submitting ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!isMotoboyRole(roles) && !isStaffRole(roles)) {
    return (
      <div className="relative isolate grid min-h-screen place-items-center px-4">
        <HoneyBackground />
        <Toaster richColors position="top-center" />
        <div className="relative z-10 max-w-sm rounded-3xl border border-border bg-card/95 p-6 text-center shadow-soft backdrop-blur-sm">
          <h1 className="font-display text-xl">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta area e exclusiva para entregadores. Use o e-mail cadastrado com perfil motoboy.
          </p>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-4 rounded-full border border-border px-4 py-2 text-sm"
          >
            Sair e tentar outro e-mail
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      <HoneyBackground />
      <div className="relative z-10">
        <EntregadorWebApp onLogout={() => void handleLogout()} showPainelLink={isStaffRole(roles)} />
      </div>
    </div>
  );
}
