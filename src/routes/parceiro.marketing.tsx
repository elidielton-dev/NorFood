import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { ParceiroCard, ParceiroPage } from "@/routes/parceiro";
import { fetchResellerDashboard } from "@/lib/reseller/client";

export const Route = createFileRoute("/parceiro/marketing")({
  component: ParceiroMarketingPage,
});

const MESSAGE_TEMPLATES = [
  {
    id: "whatsapp",
    title: "WhatsApp — apresentação",
    text: "Olá! Sou parceiro NorFood e posso ativar seu restaurante com cardápio digital, pedidos e delivery integrados. Quer uma demonstração gratuita?",
  },
  {
    id: "instagram",
    title: "Instagram — legenda",
    text: "Digitalize seu restaurante com NorFood: pedidos online, gestão de mesas, delivery e WhatsApp. Fale comigo para ativar seu trial.",
  },
  {
    id: "email",
    title: "E-mail comercial",
    text: "Prezado(a),\n\nSou revendedor autorizado NorFood. Posso configurar sua operação completa (cardápio, KDS, entregadores e fiscal) em poucos dias.\n\nPosso agendar uma call?",
  },
];

function ParceiroMarketingPage() {
  const { data: dashboard } = useQuery({
    queryKey: ["reseller-dashboard"],
    queryFn: fetchResellerDashboard,
  });

  const resellerName = dashboard?.reseller.name ?? "NorFood Parceiro";
  const signupBase = typeof window !== "undefined" ? `${window.location.origin}/cadastro` : "/cadastro";

  function copyText(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    toast.success(`${label} copiado.`);
  }

  return (
    <ParceiroPage
      title="Marketing"
      subtitle="Materiais, mensagens prontas e links para captar novos restaurantes."
      actions={
        <Link
          to="/parceiro/tokens"
          className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-4 py-2.5 text-sm font-medium text-white"
        >
          <Megaphone className="size-4" />
          Criar link de ativação
        </Link>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <ParceiroCard title="Sua marca" className="lg:col-span-1">
            <p className="text-lg font-semibold text-[#111111]">{resellerName}</p>
            <p className="mt-1 text-sm text-[#6B7280]">Revendedor autorizado NorFood</p>
            <ul className="mt-4 space-y-2 text-sm text-[#6B7280]">
              <li>• Use tokens para links personalizados por campanha</li>
              <li>• Cadastro manual para clientes VIP</li>
              <li>• Suporte dedicado via Central de Ajuda</li>
            </ul>
          </ParceiroCard>

          <ParceiroCard title="Links úteis" className="lg:col-span-2">
            <div className="space-y-3">
              <LinkRow
                label="Página de cadastro NorFood"
                url={signupBase}
                onCopy={() => copyText(signupBase, "Link")}
              />
              <LinkRow
                label="Gerar token com plano e trial"
                url="/parceiro/tokens"
                internal
              />
              <LinkRow
                label="Academia — treinamento de vendas"
                url="/parceiro/academia"
                internal
              />
            </div>
          </ParceiroCard>
        </div>

        <ParceiroCard title="Mensagens prontas" description="Copie e adapte para WhatsApp, redes sociais ou e-mail.">
          <div className="grid gap-4 lg:grid-cols-3">
            {MESSAGE_TEMPLATES.map((tpl) => (
              <article key={tpl.id} className="rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] p-4">
                <h3 className="text-sm font-semibold text-[#111111]">{tpl.title}</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#6B7280]">{tpl.text}</p>
                <button
                  type="button"
                  onClick={() => copyText(tpl.text, tpl.title)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#FF9100] hover:underline"
                >
                  <Copy className="size-3.5" />
                  Copiar texto
                </button>
              </article>
            ))}
          </div>
        </ParceiroCard>

        <ParceiroCard title="Playbook de aquisição">
          <ol className="space-y-4 text-sm text-[#6B7280]">
            <PlaybookStep n={1} title="Prospecção local">
              Liste restaurantes da região sem delivery digital ou com operação fragmentada.
            </PlaybookStep>
            <PlaybookStep n={2} title="Demonstração">
              Crie um restaurante trial ou envie token — mostre cardápio, pedidos e painel KDS.
            </PlaybookStep>
            <PlaybookStep n={3} title="Ativação">
              Converta trial em plano pago e acompanhe métricas em Relatórios.
            </PlaybookStep>
            <PlaybookStep n={4} title="Expansão">
              Peça indicações e desbloqueie conquistas ao crescer a carteira.
            </PlaybookStep>
          </ol>
        </ParceiroCard>
      </div>
    </ParceiroPage>
  );
}

function LinkRow({
  label,
  url,
  onCopy,
  internal,
}: {
  label: string;
  url: string;
  onCopy?: () => void;
  internal?: boolean;
}) {
  const fullUrl = internal ? (typeof window !== "undefined" ? `${window.location.origin}${url}` : url) : url;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#E5E7EB] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-[#111111]">{label}</p>
        <p className="truncate text-xs text-[#6B7280]">{fullUrl}</p>
      </div>
      <div className="flex gap-2">
        {onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
          >
            <Copy className="size-3.5" />
            Copiar
          </button>
        ) : null}
        {internal ? (
          <Link
            to={url}
            className="inline-flex items-center gap-1 rounded-lg bg-[#111111] px-2.5 py-1.5 text-xs font-medium text-white"
          >
            Abrir
          </Link>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-[#111111] px-2.5 py-1.5 text-xs font-medium text-white"
          >
            <ExternalLink className="size-3.5" />
            Abrir
          </a>
        )}
      </div>
    </div>
  );
}

function PlaybookStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#FF9100]/10 text-xs font-bold text-[#C45A00]">
        {n}
      </span>
      <div>
        <p className="font-medium text-[#111111]">{title}</p>
        <p className="mt-0.5">{children}</p>
      </div>
    </li>
  );
}
