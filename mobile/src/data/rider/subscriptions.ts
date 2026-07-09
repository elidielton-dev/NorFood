import { mobileSupabase } from "../../lib/supabase";
import { requireSupabase } from "./supabase";

export function subscribeToRiderDataChanges(riderId: string, onChange: () => void) {
  if (!mobileSupabase) {
    return () => undefined;
  }
  const supabase = requireSupabase();
  const channel = supabase
    .channel(`rider-app-${riderId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "entregas" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "rotas_entrega" }, onChange)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "motoboy_ocorrencias" },
      onChange,
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "motoboy_mensagens" }, onChange)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "motoboy_notificacoes" },
      onChange,
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "entregador_perfis" }, onChange)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
