import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { NorfoodLogo } from "@/components/brand/norfood-logo";
import { PlanPicker, PlanSummary } from "@/components/billing/plan-picker";
import {
  createSignupVerificationCheckoutServer,
  createSignupVerificationPixServer,
  registerRestaurantServer,
  suggestRestaurantSlugServer,
} from "@/lib/api/platform-billing.functions";
import { lookupCnpjPublicServer } from "@/lib/api/fiscal.functions";
import type { BillingModel, BillingPlanId } from "@/lib/platform/billing-plans";
import type { DocumentType } from "@/lib/document-validation";
import { formatDocument, validateDocument } from "@/lib/document-validation";
import { fetchAddressByCep, formatCep, normalizeCep } from "@/lib/viacep";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { tenantPath } from "@/lib/tenant/painel-routes";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cadastro")({
  ssr: false,
  component: CadastroPage,
});

const STEPS = ["Plano", "Restaurante", "Endereço", "Conta", "Validar"] as const;

function CadastroPage() {
  const [step, setStep] = useState(0);
  const [billingModel, setBillingModel] = useState<BillingModel>("monthly");
  const [plan, setPlan] = useState<BillingPlanId>("pro");
  const [restaurantName, setRestaurantName] = useState("");
  const [slug, setSlug] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("cnpj");
  const [documentNumber, setDocumentNumber] = useState("");
  const [legalName, setLegalName] = useState("");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [streetNumber, setStreetNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registeredSlug, setRegisteredSlug] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [pixData, setPixData] = useState<{ qrCode: string; qrCodeBase64: string } | null>(null);
  const [requiresPayment, setRequiresPayment] = useState(false);

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

  async function fillAddressFromCep() {
    const normalized = normalizeCep(cep);
    if (normalized.length !== 8) {
      toast.error("Informe um CEP válido com 8 dígitos.");
      return;
    }
    setLoadingCep(true);
    try {
      const result = await fetchAddressByCep(normalized);
      setCep(formatCep(result.cep));
      if (result.street) setStreet(result.street);
      if (result.neighborhood) setNeighborhood(result.neighborhood);
      if (result.city) setCity(result.city);
      if (result.state) setState(result.state);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CEP não encontrado.");
    } finally {
      setLoadingCep(false);
    }
  }

  async function lookupCnpj() {
    if (documentType !== "cnpj") return;
    const doc = validateDocument("cnpj", documentNumber);
    if (!doc.ok) {
      toast.error(doc.error);
      return;
    }
    setLoadingCnpj(true);
    try {
      const result = await lookupCnpjPublicServer({ data: { cnpj: doc.normalized } });
      setLegalName(result.empresa.razaoSocial || result.empresa.nomeFantasia || legalName);
      if (result.empresa.cep) setCep(formatCep(result.empresa.cep));
      if (result.empresa.logradouro) setStreet(result.empresa.logradouro);
      if (result.empresa.numero) setStreetNumber(result.empresa.numero);
      if (result.empresa.bairro) setNeighborhood(result.empresa.bairro);
      if (result.empresa.municipio) setCity(result.empresa.municipio);
      if (result.empresa.uf) setState(result.empresa.uf);
      toast.success("Dados do CNPJ preenchidos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.");
    } finally {
      setLoadingCnpj(false);
    }
  }

  async function getAuthHeaders() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }

  async function onSubmitAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      toast.error("Cadastro completo requer Supabase configurado.");
      return;
    }
    if (!acceptedTerms) {
      toast.error("Aceite os termos para continuar.");
      return;
    }

    const doc = validateDocument(documentType, documentNumber);
    if (!doc.ok) {
      toast.error(doc.error);
      return;
    }

    setLoading(true);
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
          data: { nome },
          emailRedirectTo: `${window.location.origin}/cadastro`,
        },
      });

      if (signUpError) {
        if (signUpError.message.toLowerCase().includes("already registered")) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: senha });
          if (signInError) throw signInError;
        } else {
          throw signUpError;
        }
      } else if (signUpData.user && !signUpData.session) {
        toast.message("Confirme seu e-mail", {
          description:
            "Enviamos um link de confirmação. Abra o e-mail, confirme e volte aqui para continuar.",
          duration: 8000,
        });
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user.email_confirmed_at) {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user?.email_confirmed_at) {
          throw new Error(
            "Confirme seu e-mail antes de continuar. Verifique a caixa de entrada e clique no link de confirmação.",
          );
        }
      }

      const headers = await getAuthHeaders();
      if (!headers) throw new Error("Não foi possível autenticar após cadastro.");

      const metaRes = await fetch("/api/signup-client-meta");
      const meta = metaRes.ok ? ((await metaRes.json()) as { ip?: string }) : { ip: "unknown" };

      const result = await registerRestaurantServer({
        data: {
          restaurantName: restaurantName.trim(),
          slug: slug.trim().toLowerCase(),
          billingModel,
          plan: billingModel === "monthly" ? plan : undefined,
          acceptedTerms: true,
          documentType,
          documentNumber: doc.normalized,
          legalName: legalName.trim(),
          cep,
          street: street.trim(),
          streetNumber: streetNumber.trim(),
          neighborhood: neighborhood.trim(),
          city: city.trim(),
          state: state.trim(),
          ownerPhone: ownerPhone.trim(),
          clientIp: meta.ip ?? "unknown",
        },
        headers,
      });

      setRegisteredSlug(result.slug);
      setRequiresPayment(result.requiresPaymentVerification);
      setCheckoutUrl(result.checkoutUrl);
      setStep(4);
      toast.success(`Restaurante "${result.name}" criado!`);

      if (!result.requiresPaymentVerification) {
        window.location.href = tenantPath(result.slug, "estabelecimento/plano");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  }

  async function startPixValidation() {
    if (!registeredSlug) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      if (!headers) throw new Error("Faça login novamente.");
      const result = await createSignupVerificationPixServer({ data: registeredSlug, headers });
      setPixData({ qrCode: result.qrCode, qrCodeBase64: result.qrCodeBase64 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar Pix");
    } finally {
      setLoading(false);
    }
  }

  async function refreshCheckout() {
    if (!registeredSlug) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      if (!headers) throw new Error("Faça login novamente.");
      const result = await createSignupVerificationCheckoutServer({ data: registeredSlug, headers });
      setCheckoutUrl(result.checkoutUrl);
      window.open(result.checkoutUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao abrir checkout");
    } finally {
      setLoading(false);
    }
  }

  function nextStep() {
    if (step === 1 && (!restaurantName.trim() || !slug.trim())) {
      toast.error("Informe o nome e endereço da loja.");
      return;
    }
    if (step === 2) {
      const doc = validateDocument(documentType, documentNumber);
      if (!doc.ok) {
        toast.error(doc.error);
        return;
      }
      if (!legalName.trim() || normalizeCep(cep).length !== 8 || !street.trim() || !city.trim()) {
        toast.error("Preencha documento, CEP e endereço completo.");
        return;
      }
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

        <div className="mb-6 flex flex-wrap justify-center gap-2">
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
              <span
                className={cn(
                  "hidden text-sm sm:inline",
                  i === step ? "font-semibold text-[#111111]" : "text-[#6B7280]",
                )}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
          <h1 className="text-center text-2xl font-semibold text-[#111111]">
            {step === 0
              ? "Escolha como pagar"
              : step === 1
                ? "Seu restaurante"
                : step === 2
                  ? "Endereço e documento"
                  : step === 3
                    ? "Sua conta"
                    : "Validar pagamento"}
          </h1>

          <form
            onSubmit={step === 3 ? onSubmitAccount : (e) => e.preventDefault()}
            className="mt-6 space-y-4"
          >
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
                  <span className="mb-1.5 block text-xs font-medium text-[#6B7280]">
                    Nome do restaurante *
                  </span>
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
                      onChange={(e) =>
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                      }
                      placeholder="pizzaria-joao"
                      className="h-10 flex-1 bg-transparent text-sm outline-none"
                    />
                  </div>
                </label>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <div className="flex gap-2">
                  {(["cnpj", "cpf"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setDocumentType(type)}
                      className={cn(
                        "h-10 flex-1 rounded-lg border text-sm font-medium",
                        documentType === type
                          ? "border-[#FF9100] bg-[#FFF7ED] text-[#111111]"
                          : "border-[#E5E7EB] text-[#6B7280]",
                      )}
                    >
                      {type.toUpperCase()}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-[#6B7280]">
                    {documentType === "cnpj" ? "CNPJ *" : "CPF *"}
                  </span>
                  <div className="flex gap-2">
                    <input
                      required
                      value={documentNumber}
                      onChange={(e) =>
                        setDocumentNumber(formatDocument(documentType, e.target.value))
                      }
                      placeholder={documentType === "cnpj" ? "00.000.000/0000-00" : "000.000.000-00"}
                      className={inputClass}
                    />
                    {documentType === "cnpj" ? (
                      <button
                        type="button"
                        onClick={() => void lookupCnpj()}
                        disabled={loadingCnpj}
                        className="shrink-0 rounded-lg border border-[#E5E7EB] px-3 text-xs font-medium"
                      >
                        {loadingCnpj ? "..." : "Buscar"}
                      </button>
                    ) : null}
                  </div>
                </label>
                <input
                  required
                  placeholder={documentType === "cnpj" ? "Razão social *" : "Nome completo *"}
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <input
                    required
                    placeholder="CEP *"
                    value={cep}
                    onChange={(e) => setCep(formatCep(e.target.value))}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => void fillAddressFromCep()}
                    disabled={loadingCep}
                    className="shrink-0 rounded-lg bg-[#FF9100] px-4 text-sm font-medium text-white"
                  >
                    {loadingCep ? "..." : "Buscar CEP"}
                  </button>
                </div>
                <input
                  required
                  placeholder="Rua / logradouro *"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className={inputClass}
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    placeholder="Nº"
                    value={streetNumber}
                    onChange={(e) => setStreetNumber(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    required
                    placeholder="Bairro *"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    className={cn(inputClass, "col-span-2")}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    required
                    placeholder="Cidade *"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={cn(inputClass, "col-span-2")}
                  />
                  <input
                    required
                    placeholder="UF *"
                    maxLength={2}
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    className={inputClass}
                  />
                </div>
              </>
            ) : null}

            {step === 3 ? (
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
                  type="tel"
                  placeholder="WhatsApp / telefone"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  className={inputClass}
                />
                <input
                  required
                  type="email"
                  placeholder="E-mail (será confirmado)"
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
                    Aceito os termos e o plano <PlanSummary billingModel={billingModel} plan={plan} />{" "}
                    com 14 dias de trial. Um CNPJ/CPF só pode ter um restaurante. Validação simbólica
                    de R$ 1,00 via Mercado Pago.
                  </span>
                </label>
              </>
            ) : null}

            {step === 4 && requiresPayment ? (
              <div className="space-y-4 text-sm text-[#6B7280]">
                <p>
                  Para ativar o trial, valide seu método de pagamento com uma cobrança simbólica de{" "}
                  <strong className="text-[#111111]">R$ 1,00</strong> (cartão ou Pix).
                </p>
                {checkoutUrl ? (
                  <a
                    href={checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 items-center justify-center rounded-lg bg-[#FF9100] font-medium text-white"
                  >
                    Pagar com cartão — R$ 1,00
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => void refreshCheckout()}
                    disabled={loading}
                    className="h-11 w-full rounded-lg bg-[#FF9100] font-medium text-white"
                  >
                    Gerar checkout cartão
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void startPixValidation()}
                  disabled={loading}
                  className="h-11 w-full rounded-lg border border-[#E5E7EB] font-medium text-[#111111]"
                >
                  Validar via Pix — R$ 1,00
                </button>
                {pixData?.qrCodeBase64 ? (
                  <div className="rounded-xl border border-[#E5E7EB] p-4 text-center">
                    <img
                      src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                      alt="QR Code Pix"
                      className="mx-auto size-48"
                    />
                    <p className="mt-2 break-all text-xs">{pixData.qrCode}</p>
                  </div>
                ) : null}
                {registeredSlug ? (
                  <Link
                    to={tenantPath(registeredSlug, "estabelecimento/plano")}
                    className="block text-center text-sm font-medium text-[#FF9100]"
                  >
                    Já paguei — ir para o painel
                  </Link>
                ) : null}
              </div>
            ) : null}

            {step < 4 ? (
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
                {step < 3 ? (
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
            ) : null}
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
