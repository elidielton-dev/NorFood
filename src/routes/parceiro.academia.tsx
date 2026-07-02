import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, PlayCircle } from "lucide-react";
import { ParceiroCard, ParceiroPage } from "@/routes/parceiro";

export const Route = createFileRoute("/parceiro/academia")({
  component: ParceiroAcademiaPage,
});

const MODULES = [
  {
    id: "onboarding",
    title: "Onboarding do hiperador",
    duration: "15 min",
    lessons: 4,
    done: true,
    topics: ["Portal parceiro", "Licenças e tokens", "Primeiro restaurante", "Impersonate seguro"],
  },
  {
    id: "vendas",
    title: "Vendas consultivas",
    duration: "25 min",
    lessons: 5,
    done: false,
    topics: ["Prospecção local", "Demo ao vivo", "Objeções comuns", "Fechamento", "Pós-venda"],
  },
  {
    id: "produto",
    title: "Dominando o NorFood",
    duration: "40 min",
    lessons: 6,
    done: false,
    topics: ["Cardápio digital", "Mesas e KDS", "Delivery", "WhatsApp", "Fiscal NFC-e", "Relatórios"],
  },
  {
    id: "escala",
    title: "Escalar a carteira",
    duration: "20 min",
    lessons: 3,
    done: false,
    topics: ["Marketing de parceiro", "Indicações", "Conquistas e metas"],
  },
];

function ParceiroAcademiaPage() {
  const completed = MODULES.filter((m) => m.done).length;
  const progress = Math.round((completed / MODULES.length) * 100);

  return (
    <ParceiroPage
      title="Academia"
      subtitle="Trilhas de capacitação para vender, implantar e escalar restaurantes NorFood."
    >
      <div className="space-y-6">
        <ParceiroCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#111111]">Seu progresso</p>
              <p className="text-xs text-[#6B7280]">
                {completed} de {MODULES.length} módulos concluídos
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 w-40 overflow-hidden rounded-full bg-[#F3F4F6]">
                <div className="h-full rounded-full bg-[#FF9100]" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-sm font-bold text-[#111111]">{progress}%</span>
            </div>
          </div>
        </ParceiroCard>

        <div className="grid gap-4 lg:grid-cols-2">
          {MODULES.map((mod) => (
            <article
              key={mod.id}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#FF9100]">
                    {mod.duration} · {mod.lessons} aulas
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-[#111111]">{mod.title}</h2>
                </div>
                {mod.done ? (
                  <CheckCircle2 className="size-6 text-emerald-500" />
                ) : (
                  <Circle className="size-6 text-[#D1D5DB]" />
                )}
              </div>
              <ul className="mt-4 space-y-1.5">
                {mod.topics.map((topic) => (
                  <li key={topic} className="flex items-center gap-2 text-sm text-[#6B7280]">
                    <PlayCircle className="size-3.5 shrink-0 text-[#FF9100]" />
                    {topic}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-4 rounded-xl bg-[#111111] px-4 py-2 text-sm font-medium text-white opacity-90"
                disabled={mod.id !== "onboarding"}
              >
                {mod.done ? "Revisar" : mod.id === "onboarding" ? "Continuar" : "Em breve"}
              </button>
            </article>
          ))}
        </div>

        <ParceiroCard title="Próximos passos">
          <p className="text-sm text-[#6B7280]">
            Complete o módulo de onboarding e aplique na prática criando um restaurante trial. Depois explore{" "}
            <Link to="/parceiro/marketing" className="font-medium text-[#FF9100] hover:underline">
              Marketing
            </Link>{" "}
            e{" "}
            <Link to="/parceiro/conquistas" className="font-medium text-[#FF9100] hover:underline">
              Conquistas
            </Link>
            .
          </p>
        </ParceiroCard>
      </div>
    </ParceiroPage>
  );
}
