import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { criarCupom, listarCupons } from "@/lib/shared/db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Ticket } from "lucide-react";
import {
  GestaoButton,
  GestaoCard,
  GestaoField,
  GestaoInput,
  GestaoPage,
  GestaoSectionTitle,
  GestaoSelect,
  StatusPill,
} from "@/components/painel/gestao-ui";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import { tenantQueryKey } from "@/lib/tenant/query-keys";

export const Route = createFileRoute("/_authenticated/painel/cupons")({
  component: Cupons,
});

function Cupons() {
  const qc = useQueryClient();
  const tenantSlug = useTenantSlug();
  const { data: cupons = [] } = useQuery({
    queryKey: tenantQueryKey("cupons", tenantSlug),
    queryFn: listarCupons,
  });

  const [codigo, setCodigo] = useState("");
  const [desconto, setDesconto] = useState(10);
  const [tipoDesconto, setTipoDesconto] = useState<"percentual" | "valor">("percentual");
  const [validoAte, setValidoAte] = useState("");
  const [usosMaximos, setUsosMaximos] = useState("");

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    try {
      await criarCupom({
        codigo: codigo.toUpperCase().trim(),
        desconto_percentual: tipoDesconto === "percentual" ? desconto : null,
        desconto_valor: tipoDesconto === "valor" ? desconto : null,
        descricao: `Cupom ${codigo}`,
        valido_ate: validoAte ? new Date(`${validoAte}T23:59:59`).toISOString() : null,
        usos_maximos: usosMaximos ? Number(usosMaximos) : null,
      });
      toast.success("Cupom criado!");
      setCodigo("");
      setValidoAte("");
      setUsosMaximos("");
      qc.invalidateQueries({ queryKey: tenantQueryKey("cupons", tenantSlug) });
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function desativarCupom(id: string) {
    const { error } = await supabase.from("cupons").update({ ativo: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cupom desativado.");
    qc.invalidateQueries({ queryKey: tenantQueryKey("cupons", tenantSlug) });
  }

  return (
    <GestaoPage
      title="Cupons e Fidelização"
      subtitle="Campanhas com validade, limite de usos e desconto percentual ou fixo."
    >
      <GestaoCard className="bg-[linear-gradient(180deg,white,var(--gestao-cream))]">
        <GestaoSectionTitle
          eyebrow="Cupom promocional"
          title="Criar nova campanha"
          description="Válido para delivery, balcão, mesas e QR Code."
        />
        <form onSubmit={criar} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <GestaoField label="Código" required>
            <GestaoInput
              required
              placeholder="CÓDIGO"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="uppercase"
            />
          </GestaoField>
          <GestaoField label="Tipo de desconto">
            <GestaoSelect
              value={tipoDesconto}
              onChange={(e) => setTipoDesconto(e.target.value as "percentual" | "valor")}
            >
              <option value="percentual">Desconto %</option>
              <option value="valor">Desconto R$</option>
            </GestaoSelect>
          </GestaoField>
          <GestaoField label="Valor" required>
            <GestaoInput
              required
              type="number"
              min={1}
              max={tipoDesconto === "percentual" ? 100 : 1000}
              value={desconto}
              onChange={(e) => setDesconto(+e.target.value)}
            />
          </GestaoField>
          <GestaoField label="Validade">
            <GestaoInput
              type="date"
              value={validoAte}
              onChange={(e) => setValidoAte(e.target.value)}
            />
          </GestaoField>
          <GestaoField label="Limite de usos">
            <GestaoInput
              type="number"
              min={1}
              placeholder="Opcional"
              value={usosMaximos}
              onChange={(e) => setUsosMaximos(e.target.value)}
            />
          </GestaoField>
          <GestaoButton type="submit" className="md:col-span-2">
            <Plus className="size-4" /> Ativar cupom
          </GestaoButton>
        </form>
      </GestaoCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cupons.map((c: any) => (
          <GestaoCard key={c.id} className="bg-[linear-gradient(180deg,white,var(--gestao-cream))]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Ticket className="size-4 text-[color:var(--gestao-gold-deep)]" />
                  <p className="font-display text-2xl text-[color:var(--gestao-ink)]">{c.codigo}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{c.descricao}</p>
              </div>
              <StatusPill tone={c.ativo ? "success" : "warning"}>
                {c.ativo ? "ativo" : "inativo"}
              </StatusPill>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <p className="font-display text-3xl text-[color:var(--gestao-ink)]">
                {c.desconto_percentual ? `${c.desconto_percentual}%` : `R$ ${c.desconto_valor}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Usos: {c.usos}
                {c.usos_maximos ? ` / ${c.usos_maximos}` : ""}
              </p>
            </div>
            {c.valido_ate ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Válido até {new Date(c.valido_ate).toLocaleDateString("pt-BR")}
              </p>
            ) : null}
            {c.ativo ? (
              <GestaoButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void desativarCupom(c.id)}
                className="mt-4 px-0 text-destructive hover:bg-transparent hover:text-destructive"
              >
                Desativar cupom
              </GestaoButton>
            ) : null}
          </GestaoCard>
        ))}
      </div>
    </GestaoPage>
  );
}
