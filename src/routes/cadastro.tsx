import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { NorfoodLogo } from "@/components/brand/norfood-logo";
import { PlanPicker, PlanSummary } from "@/components/billing/plan-picker";
import { registerRestaurantServer, suggestRestaurantSlugServer } from "@/lib/api/platform-billing.functions";
import type { BillingModel, BillingPlanId } from "@/lib/platform/billing-plans";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { tenantPath } from "@/lib/tenant/painel-routes";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cadastro")({
  ssr: false,
  component: CadastroPage,
});

const STEPS = ["Plano", "Restaurante", "Conta"] as const;

function CadastroPage() {
  const [step, setStep] = useState(0);
  const [billingModel, setBillingModel] = useState<BillingModel>("monthly");
  const [plan, setPlan] = useState<BillingPlanId>("pro");
  const [restaurantName, setRestaurantName] = useState("");
  const [slug, setSlug] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!restaurantName.trim() || step < 1) return;
    const timer = window.setTimeout(async () => {
      try {
        const suggested = await suggestRestaurantSlugServer({ data: restaurantName });
        setSlug(suggested);
      } catch {
        setSlug(restaurantName.trim().toLowerCase().replace(/\s+/g, "-"));
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [restaurantName, step]);

  async function getAuthHeaders() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      toast.error("Cadastro completo requer Supabase configurado.");
      return;
    }
    if (!acceptedTerms) {
      toast.error("Aceite os termos para continuar.");
      return;
    }

    setLoading(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password: senha,
        options: { data: { nome } },
      });
      if (signUpError) throw signUpError;

      let headers = await getAuthHeaders();
      if (!headers) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (signInError) throw signInError;
        headers = await getAuthHeaders();
      }
      if (!headers) throw new Error("Não foi possível autenticar após cadastro.");

      const result = await registerRestaurantServer({
        data: {
          restaurantName: restaurantName.trim(),
          slug: slug.trim().toLowerCase(),
          billingModel,
          plan: billingModel === "monthly" ? plan : undefined,
          acceptedTerms: true,
        },
        headers,
      });

      toast.success(`Restaurante "${result.name}" criado! Trial de 14 dias ativo.`);
      window.location.href = tenantPath(result.slug, "dashboard");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  }

  function nextStep() {
    if (step === 1 && (!restaurantName.trim() || !slug.trim())) {
      toast.error("Informe o nome e endereço da loja.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] px-4 py-8">
      <Toaster richColors position="top-center" />
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex justify-center">
          <NorfoodLogo size="lg" />
        </div>

        <div className="mb-6 flex justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full text-xs font-semibold",
                  i <= step ? "bg-[#FF9100] text-white" : "bg-[#E5E7EB] text-[#6B7280]",
                )}
              >
                {i + 1}
              </span>
              <span className={cn("hidden text-sm sm:inline", i === step ? "font-semibold text-[#111111]" : "text-[#6B7280]")}>
                {label}
              </span>
              {i < STEPS.length - 1 ? <span className="hidden h-px w-6 bg-[#E5E7EB] sm:block" /> : null}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
          <h1 className="text-center text-2xl font-semibold text-[#111111]">
            {step === 0 ? "Escolha como pagar" : step === 1 ? "Seu restaurante" : "Sua conta"}
          </h1>
          {step === 0 ? (
            <p className="mt-2 text-center text-sm text-[#6B7280]">
              Mensalidade fixa ou 2% sobre vendas — você decide.
            </p>
          ) : null}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {step === 0 ? (
              <PlanPicker
                billingModel={billingModel}
                onBillingModelChange={setBillingModel}
                selectedPlan={plan}
                onPlanChange={setPlan}
              />
            ) : null}

            {step === 1 ? (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-[#6B7280]">Nome do restaurante *</span>
                  <input
                    required
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    placeholder="Pizzaria do João"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-[#6B7280]">
                    Endereço da loja (URL) *
                  </span>
                  <div className="flex items-center gap-1 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3">
                    <span className="shrink-0 text-xs text-[#6B7280]">norfood.com.br/loja/</span>
                    <input
                      required
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="pizzaria-joao"
                      className="h-10 flex-1 bg-transparent text-sm outline-none"
                    />
                  </div>
                </label>
                <div className="rounded-lg bg-[#FFF7ED] px-3 py-2 text-xs text-[#5C4A3A]">
                  Plano escolhido: <PlanSummary billingModel={billingModel} plan={plan} />
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <input
                  required
                  placeholder="Seu nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className={inputClass}
                />
                <input
                  required
                  type="email"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
                <input
                  required
                  type="password"
                  placeholder="Senha (mín. 6 caracteres)"
                  minLength={6}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className={inputClass}
                />
                <label className="flex items-start gap-2 text-sm text-[#6B7280]">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Aceito os termos de uso e o plano{" "}
                    <PlanSummary billingModel={billingModel} plan={plan} /> com 14 dias de trial.
                  </span>
                </label>
              </>
            ) : null}

            <div className="flex gap-3 pt-2">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="h-11 flex-1 rounded-lg border border-[#E5E7EB] text-sm font-medium text-[#111111]"
                >
                  Voltar
                </button>
              ) : null}
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="h-11 flex-1 rounded-lg bg-[#FF9100] text-sm font-medium text-white hover:bg-[#FF5C00]"
                >
                  Continuar
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="h-11 flex-1 rounded-lg bg-[#FF9100] text-sm font-medium text-white hover:bg-[#FF5C00] disabled:opacity-60"
                >
                  {loading ? "Criando..." : "Criar restaurante"}
                </button>
              )}
            </div>
          </form>

          <p className="mt-4 text-center text-sm text-[#6B7280]">
            <Link to="/login">Já tenho conta</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none focus:border-[#FF9100]";
