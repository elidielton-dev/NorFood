import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatBRL, criarLancamentoFinanceiro, listarLancamentosFinanceiros, type LancamentoFinanceiro } from "@/lib/db";
import { toast } from "sonner";
import { Plus, ArrowUp, ArrowDown, Landmark, QrCode } from "lucide-react";
import { getIntegrationStatus } from "@/lib/api/integrations.functions";
import { VendaDetalheModal } from "@/components/venda-detalhe-modal";
import {
  GestaoButton,
  GestaoCard,
  GestaoField,
  GestaoInput,
  GestaoPage,
  GestaoSectionTitle,
  GestaoSelect,
  GestaoStat,
  GestaoTable,
  GestaoTableHead,
  GestaoToolbar,
} from "@/components/gestao-ui";

function isVendaLancamento(lancamento: LancamentoFinanceiro) {
  return Boolean(lancamento.pedido_id) || /pedido\s*#/i.test(lancamento.descricao);
}

export function FinanceiroFluxoPage() {
  const qc = useQueryClient();
  const [pedidoDetalheId, setPedidoDetalheId] = useState<string | null>(null);
  const { data: lancamentos = [] } = useQuery({
    queryKey: ["financeiro"],
    queryFn: listarLancamentosFinanceiros,
  });
  const { data: integrations } = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => getIntegrationStatus(),
  });

  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState<number>(0);

  const entradas = lancamentos
    .filter((l: { tipo: string }) => l.tipo === "entrada")
    .reduce((s, l: { valor: number }) => s + Number(l.valor), 0);
  const saidas = lancamentos
    .filter((l: { tipo: string }) => l.tipo === "saida")
    .reduce((s, l: { valor: number }) => s + Number(l.valor), 0);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    try {
      await criarLancamentoFinanceiro({ tipo, descricao, valor, categoria: "Lancamento manual" });
    } catch (error: unknown) {
      return toast.error(error instanceof Error ? error.message : "Erro ao lancar");
    }
    setDescricao("");
    setValor(0);
    qc.invalidateQueries({ queryKey: ["financeiro"] });
    toast.success("Lancamento adicionado");
  }

  return (
    <>
    <GestaoPage title="Fluxo de caixa" subtitle="Entradas, saidas e conciliacao interna da loja">
      <div className="grid gap-4 lg:grid-cols-2">
        <GestaoCard>
          <GestaoSectionTitle
            title="Banco Inter"
            description={
              integrations?.inter.enabled
                ? "Credenciais detectadas. Pix, saldo e extrato podem ser ativados em producao."
                : "Integracao preparada. Falta informar client id, secret, certificado e chave privada."
            }
            action={<Landmark className="size-5 shrink-0 text-sage" />}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Escopos: {integrations?.inter.scopes ?? "carregando..."}
          </p>
        </GestaoCard>

        <GestaoCard>
          <GestaoSectionTitle
            title="Pix integrado"
            description="Pedidos do delivery podem gerar cobranca Pix e conciliacao automatica."
            action={<QrCode className="size-5 shrink-0 text-gold" />}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Webhook MP: {integrations?.mercadoPago.webhookUrl || "nao configurado"}
          </p>
        </GestaoCard>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GestaoStat
          label="Entradas"
          value={formatBRL(entradas)}
          icon={<ArrowUp className="size-5" />}
          tone="success"
        />
        <GestaoStat
          label="Saidas"
          value={formatBRL(saidas)}
          icon={<ArrowDown className="size-5" />}
          tone="warning"
        />
        <GestaoStat
          label="Saldo"
          value={formatBRL(entradas - saidas)}
          icon={<span className="font-display text-lg">R$</span>}
          tone="gold"
        />
      </div>

      <GestaoCard>
        <form onSubmit={criar}>
          <GestaoToolbar className="w-full">
            <GestaoField label="Tipo" className="w-full sm:w-auto sm:min-w-[140px]">
              <GestaoSelect
                value={tipo}
                onChange={(e) => setTipo(e.target.value as "entrada" | "saida")}
              >
                <option value="entrada">Entrada</option>
                <option value="saida">Saida</option>
              </GestaoSelect>
            </GestaoField>
            <GestaoField label="Descricao" className="min-w-0 flex-1">
              <GestaoInput
                required
                placeholder="Descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </GestaoField>
            <GestaoField label="Valor" className="w-full sm:w-28">
              <GestaoInput
                required
                type="number"
                step="0.01"
                min={0}
                value={valor}
                onChange={(e) => setValor(+e.target.value)}
              />
            </GestaoField>
            <GestaoButton type="submit" className="w-full sm:w-auto sm:self-end">
              <Plus className="size-4" /> Lancar
            </GestaoButton>
          </GestaoToolbar>
        </form>
      </GestaoCard>

      <GestaoTable>
        <GestaoTableHead>
          <tr>
            <th className="p-3">Data</th>
            <th className="p-3">Descricao</th>
            <th className="hidden p-3 sm:table-cell">Tipo</th>
            <th className="p-3 text-right">Valor</th>
          </tr>
        </GestaoTableHead>
        <tbody>
          {lancamentos.map((l: LancamentoFinanceiro) => (
              <tr
                key={l.id}
                className={`border-t border-[color:var(--honey-line)] ${isVendaLancamento(l) && l.pedido_id ? "cursor-pointer transition hover:bg-[color:var(--gestao-cream)]/60" : ""}`}
                onClick={() => {
                  if (isVendaLancamento(l) && l.pedido_id) setPedidoDetalheId(l.pedido_id);
                }}
              >
                <td className="p-3 text-muted-foreground">
                  {new Date(l.data).toLocaleDateString("pt-BR")}
                </td>
                <td className="p-3">{l.descricao}</td>
                <td
                  className={`hidden p-3 capitalize sm:table-cell ${l.tipo === "entrada" ? "text-emerald-600" : "text-rose-600"}`}
                >
                  {l.tipo}
                </td>
                <td className="p-3 text-right font-display text-lg">
                  {formatBRL(Number(l.valor))}
                </td>
              </tr>
            ))}
        </tbody>
      </GestaoTable>
    </GestaoPage>
    <VendaDetalheModal
      open={Boolean(pedidoDetalheId)}
      onClose={() => setPedidoDetalheId(null)}
      pedidoId={pedidoDetalheId}
    />
    </>
  );
}
