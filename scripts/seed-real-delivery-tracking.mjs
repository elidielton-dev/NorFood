import { seedRealtimeTrackingScenario } from "./supabase-real-tracking-tools.mjs";

async function main() {
  const seed = await seedRealtimeTrackingScenario();

  console.log("SEED_REALTIME_OK");
  console.log(
    JSON.stringify(
      {
        rider: {
          id: seed.rider.id,
          email: seed.rider.email,
        },
        orders: seed.orders.map((order) => ({
          id: order.id,
          numero: order.numero,
          status: order.status,
          ordemNaRota: order.ordem_na_rota,
          entregadorId: order.entregador_id,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("SEED_REALTIME_FALHOU");
  console.error(error);
  process.exit(1);
});
