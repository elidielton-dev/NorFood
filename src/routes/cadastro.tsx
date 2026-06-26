import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { NorfoodLogo } from "@/components/brand/norfood-logo";

export const Route = createFileRoute("/cadastro")({
  ssr: false,
  component: CadastroPage,
});

function CadastroPage() {
  const nav = useNavigate();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: { data: { nome } },
      });
      if (error) throw error;
      toast.success("Conta criada! Faça login para continuar.");
      nav({ to: "/login" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar conta");
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
        <h1 className="text-center text-2xl font-semibold text-[#111111]">Criar conta</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            required
            placeholder="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="h-11 w-full rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none focus:border-[#FF9100]"
          />
          <input
            required
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none focus:border-[#FF9100]"
          />
          <input
            required
            type="password"
            placeholder="Senha (mín. 6 caracteres)"
            minLength={6}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="h-11 w-full rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none focus:border-[#FF9100]"
          />
          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-lg bg-[#FF9100] text-sm font-medium text-white hover:bg-[#FF5C00]"
          >
            {loading ? "Aguarde..." : "Cadastrar"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-[#6B7280]">
          <Link to="/login">Já tenho conta</Link>
        </p>
      </div>
    </div>
  );
}
