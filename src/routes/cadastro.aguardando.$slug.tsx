import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Mail, MessageCircle } from "lucide-react";
import { useEffect } from "react";
import { NorfoodLogo } from "@/components/brand/norfood-logo";
import { Toaster } from "@/components/ui/sonner";
import { getTenantAccessStatusServer } from "@/lib/api/platform-billing.functions";
import { tenantPath } from "@/lib/tenant/painel-routes";

export const Route = createFileRoute("/cadastro/aguardando/$slug")({
  ssr: false,
  component: CadastroAguardandoPage,
});

function CadastroAguardandoPage() {
  const { slug } = Route.useParams();

  const { data: access } = useQuery({
    queryKey: ["signup-waiting", slug],
    queryFn: () => getTenantAccessStatusServer({ data: slug }),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (access?.allowed) {
      window.location.href = tenantPath(slug, "dashboard");
    }
  }, [access?.allowed, slug]);

  return (
    <div className="min-h-screen bg-[#F6F7F9] px-4 py-10">
      <Toaster richColors position="top-center" />
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 flex justify-center">
          <NorfoodLogo size="lg" />
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-sm">
          <div className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-[#FFF7ED]">
            <Clock3 className="size-8 text-[#FF9100]" />
          </div>

          <h1 className="text-center text-2xl font-semibold text-[#111111]">
            Cadastro recebido!
          </h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-[#6B7280]">
            Estamos analisando os dados do seu restaurante. Em até{" "}
            <strong className="text-[#111111]">algumas horas</strong> sua conta será liberada e você
            poderá acessar o painel completo.
          </p>

          <div className="mt-8 space-y-3 rounded-xl bg-[#F6F7F9] p-4 text-sm text-[#5C4A3A]">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span>Seu cadastro foi enviado com sucesso.</span>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 size-4 shrink-0 text-[#FF9100]" />
              <span>Você receberá um e-mail quando o acesso for aprovado.</span>
            </div>
            <div className="flex items-start gap-3">
              <MessageCircle className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span>Também avisaremos pelo WhatsApp no número informado.</span>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-[#6B7280]">
            Loja: <span className="font-mono">norfood.com.br/loja/{slug}</span>
          </p>

          <p className="mt-6 text-center text-xs text-[#6B7280]">
            Esta página atualiza automaticamente. Não é necessário recarregar.
          </p>

          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <Link
              to="/"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-[#E5E7EB] text-sm font-medium text-[#111111]"
            >
              Voltar ao site
            </Link>
            <a
              href="mailto:suporte@norfood.com.br"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-[#111111] text-sm font-medium text-white hover:bg-[#333]"
            >
              Falar com suporte
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
