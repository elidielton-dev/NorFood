import { createFileRoute } from "@tanstack/react-router";
import { AtendimentoInbox } from "@/components/atendimento/atendimento-inbox";
import { usePainelSearch } from "@/lib/painel/use-painel-search";

export const Route = createFileRoute("/_authenticated/painel/atendimento/conversas")({
  validateSearch: (search: Record<string, unknown>) => ({
    c: typeof search.c === "string" && search.c.trim() ? search.c.trim() : undefined,
  }),
  component: ConversasPage,
});

const parseConversasSearch = (search: Record<string, unknown>) => ({
  c: typeof search.c === "string" && search.c.trim() ? search.c.trim() : undefined,
});

function ConversasPage() {
  const { c } = usePainelSearch(parseConversasSearch);
  return <AtendimentoInbox initialConversationId={c} />;
}
