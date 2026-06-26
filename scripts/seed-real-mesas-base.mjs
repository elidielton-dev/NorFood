import { adminClient } from "./supabase-real-tracking-tools.mjs";

const baseMesas = Array.from({ length: 12 }, (_, index) => ({
  numero: index + 1,
  capacidade: index < 8 ? 4 : 6,
  status: "livre",
  qrcode_token: `mesa-${index + 1}-cardapio`,
}));

async function ensureMesa(mesa) {
  const { data: existing, error: selectError } = await adminClient
    .from("mesas")
    .select("id,numero")
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
  const results = [];
  for (const mesa of baseMesas) {
    results.push(await ensureMesa(mesa));
  }

  const { data: mesas, error } = await adminClient
    .from("mesas")
    .select("id,numero,capacidade,status,qrcode_token")
    .order("numero", { ascending: true });
  if (error) throw error;

  console.log(
    JSON.stringify(
      {
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
