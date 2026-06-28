import { adminClient } from "./supabase-real-tracking-tools.mjs";

const TENANT_ID =
  process.env.TENANT_ID?.trim() || "a0000000-0000-4000-8000-000000000001";
const TENANT_SLUG = process.env.TENANT_SLUG?.trim() || "norfood";
const MESA_COUNT = Number.parseInt(process.env.MESA_COUNT ?? "12", 10);

const baseMesas = Array.from({ length: MESA_COUNT }, (_, index) => ({
  tenant_id: TENANT_ID,
  numero: index + 1,
  capacidade: index < 8 ? 4 : 6,
  status: "livre",
  qrcode_token: `${TENANT_SLUG}-mesa-${index + 1}`,
}));

async function ensureMesa(mesa) {
  const { data: existing, error: selectError } = await adminClient
    .from("mesas")
    .select("id,numero,tenant_id")
    .eq("tenant_id", mesa.tenant_id)
    .eq("numero", mesa.numero)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const { error: updateError } = await adminClient
      .from("mesas")
      .update({
        capacidade: mesa.capacidade,
        status: mesa.status,
        qrcode_token: mesa.qrcode_token,
        tenant_id: mesa.tenant_id,
      })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return { ...mesa, id: existing.id, action: "updated" };
  }

  const { data: inserted, error: insertError } = await adminClient
    .from("mesas")
    .insert(mesa)
    .select("id,numero")
    .single();
  if (insertError) throw insertError;

  return { ...mesa, id: inserted.id, action: "inserted" };
}

async function main() {
  console.log(`Seed mesas: tenant=${TENANT_ID} (${TENANT_SLUG}), count=${MESA_COUNT}`);

  const results = [];
  for (const mesa of baseMesas) {
    results.push(await ensureMesa(mesa));
  }

  const { data: mesas, error } = await adminClient
    .from("mesas")
    .select("id,numero,capacidade,status,qrcode_token,tenant_id")
    .eq("tenant_id", TENANT_ID)
    .order("numero", { ascending: true });
  if (error) throw error;

  console.log(
    JSON.stringify(
      {
        tenant_id: TENANT_ID,
        ensured: results.map(({ id, numero, action, qrcode_token }) => ({
          id,
          numero,
          action,
          qrcode_token,
        })),
        total: mesas.length,
        mesas,
      },
      null,
      2,
    ),
  );
  console.log("SEED_REAL_MESAS_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
