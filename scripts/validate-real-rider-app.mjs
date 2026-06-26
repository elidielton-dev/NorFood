import { createRealtimeClientSession, seedRealtimeTrackingScenario } from "./supabase-real-tracking-tools.mjs";
import { SERVICE_CITY_CONFIG } from "./city-config.mjs";

async function main() {
  const seed = await seedRealtimeTrackingScenario();
  const riderClient = await createRealtimeClientSession(seed.rider.email, "SeedMoto123!");

  const [{ data: profile, error: profileError }, { data: riderProfile, error: riderProfileError }, { data: deliveries, error: deliveriesError }] =
    await Promise.all([
      riderClient.from("profiles").select("id, nome, telefone").eq("id", seed.rider.id).single(),
      riderClient
        .from("entregador_perfis")
        .select("user_id, cep, address, neighborhood, city, state, support_phone, online")
        .eq("user_id", seed.rider.id)
        .single(),
      riderClient
        .from("entregas")
        .select("id, pedido_id, bairro, motoboy_id, status")
        .eq("motoboy_id", seed.rider.id),
    ]);

  if (profileError) throw profileError;
  if (riderProfileError) throw riderProfileError;
  if (deliveriesError) throw deliveriesError;

  if (riderProfile.state !== SERVICE_CITY_CONFIG.state) {
    throw new Error(`Perfil do entregador retornou state=${riderProfile.state} em vez de ${SERVICE_CITY_CONFIG.state}.`);
  }
  if (riderProfile.city !== SERVICE_CITY_CONFIG.city) {
    throw new Error(`Perfil do entregador retornou city=${riderProfile.city} em vez de ${SERVICE_CITY_CONFIG.city}.`);
  }
  if (riderProfile.cep !== SERVICE_CITY_CONFIG.cep) {
    throw new Error(`Perfil do entregador retornou cep=${riderProfile.cep} em vez de ${SERVICE_CITY_CONFIG.cep}.`);
  }
  if (riderProfile.support_phone !== SERVICE_CITY_CONFIG.supportPhone) {
    throw new Error(`Perfil do entregador retornou suporte antigo: ${riderProfile.support_phone}.`);
  }
  if (!deliveries?.length) {
    throw new Error("App do entregador nao recebeu entregas reais.");
  }

  console.log("VALIDACAO_RIDER_APP_REAL_OK");
  console.log(
    JSON.stringify(
      {
        rider: {
          id: seed.rider.id,
          email: seed.rider.email,
          name: profile.nome,
          phone: profile.telefone,
        },
        profile: riderProfile,
        deliveries: deliveries.map((item) => ({
          id: item.id,
          pedidoId: item.pedido_id,
          neighborhood: item.bairro,
          status: item.status,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("VALIDACAO_RIDER_APP_REAL_FALHOU");
  console.error(error);
  process.exit(1);
});
