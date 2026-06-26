import { adminClient } from "./supabase-real-tracking-tools.mjs";
import { SERVICE_CITY_CONFIG } from "./city-config.mjs";

async function main() {
  const { data: riderRoles, error: rolesError } = await adminClient
    .from("user_roles")
    .select("user_id")
    .eq("role", "motoboy");
  if (rolesError) throw rolesError;

  const riderIds = [...new Set((riderRoles ?? []).map((item) => item.user_id).filter(Boolean))];
  if (!riderIds.length) {
    console.log("NORMALIZE_RIDER_PROFILES_OK");
    console.log(JSON.stringify({ updated: 0 }, null, 2));
    return;
  }

  let page = 1;
  const authUsers = [];
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    authUsers.push(...data.users);
    if (data.users.length < 200) break;
    page += 1;
  }

  const authUserMap = new Map(authUsers.map((user) => [user.id, user]));
  const updates = [];

  for (const riderId of riderIds) {
    const authUser = authUserMap.get(riderId);
    const metadata = authUser?.user_metadata ?? {};
    const fallbackNeighborhood = SERVICE_CITY_CONFIG.neighborhoods[0];
    updates.push({
      user_id: riderId,
      cep: String(metadata.cep ?? SERVICE_CITY_CONFIG.cep),
      address: String(metadata.address ?? fallbackNeighborhood.exampleAddress),
      neighborhood: String(metadata.neighborhood ?? fallbackNeighborhood.name),
      city: String(metadata.city ?? SERVICE_CITY_CONFIG.city),
      state: String(metadata.stateCode ?? metadata.state ?? SERVICE_CITY_CONFIG.state),
      support_phone: SERVICE_CITY_CONFIG.supportPhone,
    });
  }

  const { error: upsertError } = await adminClient.from("entregador_perfis").upsert(updates, {
    onConflict: "user_id",
  });
  if (upsertError) throw upsertError;

  const { data: normalizedRows, error: normalizedError } = await adminClient
    .from("entregador_perfis")
    .select("user_id, cep, address, neighborhood, city, state, support_phone")
    .in("user_id", riderIds)
    .order("user_id");
  if (normalizedError) throw normalizedError;

  console.log("NORMALIZE_RIDER_PROFILES_OK");
  console.log(JSON.stringify({ updated: normalizedRows?.length ?? 0, riders: normalizedRows ?? [] }, null, 2));
}

main().catch((error) => {
  console.error("NORMALIZE_RIDER_PROFILES_FALHOU");
  console.error(error);
  process.exit(1);
});
