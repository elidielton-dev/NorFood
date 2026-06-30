import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { buildAppUrl } from "@/lib/app-url";
import { NorfoodLogo } from "@/components/brand/norfood-logo";

export const Route = createFileRoute("/recuperar-senha")({
  ssr: false,
  component: RecuperarSenhaPage,
});

function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const next = encodeURIComponent("/login");
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: buildAppUrl(`/auth/callback?next=${next}`),
      });
      if (error) throw error;
      setSent(true);
      toast.success("E-mail de recuperação enviado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar e-mail");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#F6F7F9] px-4">
      <Toaster richColors position="top-center" />
      <div className="w-full max-w-sm rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="mb-4 flex justify-center">
          <NorfoodLogo size="lg" />
        </div>
        <h1 className="text-center text-2xl font-semibold text-[#111111]">Recuperar senha</h1>
        {sent ? (
          <p className="mt-4 text-center text-sm text-[#6B7280]">
            Verifique sua caixa de entrada e siga o link para redefinir a senha.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <input
              required
              type="email"
              placeholder="E-mail da conta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none focus:border-[#FF9100]"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-lg bg-[#FF9100] text-sm font-medium text-white"
            >
              {loading ? "Enviando..." : "Enviar link"}
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-[#6B7280]">
          <Link to="/login">← Voltar ao login</Link>
        </p>
      </div>
    </div>
  );
}
