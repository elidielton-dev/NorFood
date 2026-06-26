import {
  adminClient,
  createRealtimeClientSession,
  seedRealtimeTrackingScenario,
  seedMarker,
} from "./supabase-real-tracking-tools.mjs";
import { SERVICE_CITY_CONFIG } from "./city-config.mjs";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const seed = await seedRealtimeTrackingScenario();
  const realtimeClient = await createRealtimeClientSession(
    "seed.motoboy@abelhaemel.local",
    "SeedMoto123!",
  );
  const [firstOrder, secondOrder, thirdOrder] = seed.orders;

  if (!firstOrder || !secondOrder || !thirdOrder) {
    throw new Error("Seed nao gerou as 3 entregas esperadas.");
  }

  if (firstOrder.ordem_na_rota !== 1 || secondOrder.ordem_na_rota !== 2 || thirdOrder.ordem_na_rota !== 3) {
    throw new Error("Fila inicial da rota nao foi criada corretamente.");
  }

  const updatedLatitude = SERVICE_CITY_CONFIG.neighborhoods[1].latitude;
  const updatedLongitude = SERVICE_CITY_CONFIG.neighborhoods[1].longitude;
  const realtimePayload = await new Promise((resolve, reject) => {
    const channel = realtimeClient.channel(`validate-location-${seed.rider.id}`).on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "entregadores_localizacao",
      },
      async (payload) => {
        if (payload.new?.entregador_id !== seed.rider.id) return;
        clearTimeout(timeout);
        await realtimeClient.removeChannel(channel);
        resolve(payload);
      },
    );

    const timeout = setTimeout(async () => {
      await realtimeClient.removeChannel(channel);
      reject(new Error("Realtime update nao chegou para entregadores_localizacao."));
    }, 30000);

    channel.subscribe(async (status, error) => {
      if (error) {
        clearTimeout(timeout);
        await realtimeClient.removeChannel(channel);
        reject(error);
        return;
      }

      if (status === "SUBSCRIBED") {
        await wait(1200);
        const { error: locationUpdateError } = await adminClient
          .from("entregadores_localizacao")
          .update({
            latitude: updatedLatitude,
            longitude: updatedLongitude,
            speed: 9.4,
            battery: 79,
            updated_at: new Date().toISOString(),
          })
          .eq("entregador_id", seed.rider.id);
        if (locationUpdateError) {
          clearTimeout(timeout);
          await realtimeClient.removeChannel(channel);
          reject(locationUpdateError);
        }
      }
    });
  });

  const { data: locationRow, error: locationReadError } = await adminClient
    .from("entregadores_localizacao")
    .select("*")
    .eq("entregador_id", seed.rider.id)
    .single();
  if (locationReadError) throw locationReadError;

  if (Number(locationRow.latitude) !== updatedLatitude || Number(locationRow.longitude) !== updatedLongitude) {
    throw new Error("Localizacao final do entregador nao foi persistida corretamente.");
  }

  const { error: deliverError } = await adminClient
    .from("pedidos")
    .update({
      status: "entregue",
      updated_at: new Date().toISOString(),
    })
    .eq("id", firstOrder.id);
  if (deliverError) throw deliverError;

  const { data: refreshedOrders, error: refreshedOrdersError } = await adminClient
    .from("pedidos")
    .select("id, numero, status, ordem_na_rota, entregador_id")
    .ilike("observacoes", `%${seedMarker}%`)
    .order("numero", { ascending: true });
  if (refreshedOrdersError) throw refreshedOrdersError;

  const { data: refreshedRoutes, error: refreshedRoutesError } = await adminClient
    .from("rotas_entrega")
    .select("pedido_id, ordem_entrega, status")
    .in("pedido_id", refreshedOrders.map((order) => order.id))
    .order("ordem_entrega", { ascending: true });
  if (refreshedRoutesError) throw refreshedRoutesError;

  const deliveredOrder = refreshedOrders.find((order) => order.id === firstOrder.id);
  const shiftedSecondOrder = refreshedOrders.find((order) => order.id === secondOrder.id);
  const shiftedThirdOrder = refreshedOrders.find((order) => order.id === thirdOrder.id);
  const deliveredRoute = refreshedRoutes.find((route) => route.pedido_id === firstOrder.id);

  if (deliveredOrder?.status !== "entregue") {
    throw new Error("Pedido principal nao foi concluido na validacao real.");
  }

  if (shiftedSecondOrder?.ordem_na_rota !== 1 || shiftedThirdOrder?.ordem_na_rota !== 2) {
    throw new Error("A fila nao foi reajustada apos concluir a primeira entrega.");
  }

  if (deliveredRoute?.status !== "entregue") {
    throw new Error("A rota da entrega concluida nao foi marcada como entregue.");
  }

  console.log("VALIDACAO_REALTIME_OK");
  console.log(
    JSON.stringify(
      {
        rider: {
          id: seed.rider.id,
          email: seed.rider.email,
        },
        realtime: {
          received: true,
          eventType: realtimePayload.eventType ?? realtimePayload.event ?? "UPDATE",
          latitude: locationRow.latitude,
          longitude: locationRow.longitude,
        },
        queueBefore: [1, 2, 3],
        queueAfter: [
          { numero: deliveredOrder?.numero, status: deliveredOrder?.status, ordemNaRota: deliveredOrder?.ordem_na_rota },
          { numero: shiftedSecondOrder?.numero, status: shiftedSecondOrder?.status, ordemNaRota: shiftedSecondOrder?.ordem_na_rota },
          { numero: shiftedThirdOrder?.numero, status: shiftedThirdOrder?.status, ordemNaRota: shiftedThirdOrder?.ordem_na_rota },
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("VALIDACAO_REALTIME_FALHOU");
  console.error(error);
  process.exit(1);
});
