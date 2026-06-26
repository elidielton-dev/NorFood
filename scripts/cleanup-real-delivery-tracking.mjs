import { cleanupRealtimeTrackingSeed, seedMarker, adminClient } from "./supabase-real-tracking-tools.mjs";

async function main() {
  await cleanupRealtimeTrackingSeed();

  const { data: remainingOrders, error } = await adminClient
    .from("pedidos")
    .select("id")
    .ilike("observacoes", `%${seedMarker}%`);
  if (error) throw error;

  console.log("CLEANUP_REALTIME_OK");
  console.log(
    JSON.stringify(
      {
        remainingSeedOrders: remainingOrders.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("CLEANUP_REALTIME_FALHOU");
  console.error(error);
  process.exit(1);
});
