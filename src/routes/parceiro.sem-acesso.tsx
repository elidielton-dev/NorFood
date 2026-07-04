import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";

export const Route = createFileRoute("/parceiro/sem-acesso")({
  ssr: false,
  component: ParceiroSemAcessoPage,
});

function ParceiroSemAcessoEmailHint() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);
  if (!email) return null;
  return (
    <p className="mt-2 text-xs text-[#9CA3AF]">
      Conta atual: <span className="font-medium text-[#6B7280]">{email}</span>
    </p>
  );
}

function ParceiroSemAcessoPage() {
  async function trocarConta() {
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
    window.location.href = "/login?redirect=%2Fparceiro";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F7F9] px-4">
      <div className="max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#FF9100]">NorFood Parceiros</p>
        <h1 className="mt-2 text-xl font-semibold text-[#111111]">Acesso restrito a revendedoras</h1>
        <p className="mt-3 text-sm text-[#6B7280]">
          Esta area e exclusiva para usuarios vinculados a uma revendedora. Faca login com o e-mail
          owner cadastrado no admin ou peça ao administrador Norfood para liberar seu acesso.
        </p>
        <ParceiroSemAcessoEmailHint />
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => void trocarConta()}
            className="rounded-xl bg-[#111111] px-4 py-2.5 text-sm font-medium text-white"
          >
            Entrar com outra conta
          </button>
          <Link
            to="/"
            className="rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm font-medium text-[#111111]"
          >
            Voltar ao site
          </Link>
        </div>
      </div>
    </div>
  );
}
