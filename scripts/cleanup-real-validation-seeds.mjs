import {
  adminClient,
  cleanupRealtimeTrackingSeed,
  deleteUserByEmail,
} from "./supabase-real-tracking-tools.mjs";

const orderMarkers = [
  "SEED_TRACKING_REALTIME",
  "SEED_REAL_COMPLETE_DELIVERY",
  "SEED_CHECKOUT_REAL",
  "SEED_CUSTODIA_BAIRROS_REAL",
];

const validationUsers = [
  "seed.motoboy@abelhaemel.local",
  "seed.cliente1@abelhaemel.local",
  "seed.cliente2@abelhaemel.local",
  "seed.cliente3@abelhaemel.local",
  "seed.gestor.fullflow@abelhaemel.local",
  "seed.motoboy.fullflow@abelhaemel.local",
  "seed.cliente.fullflow@abelhaemel.local",
  "seed.gestor.checkout@abelhaemel.local",
  "seed.motoboy.checkout@abelhaemel.local",
  "seed.cliente.checkout@abelhaemel.local",
  "seed.gestor.custodia@abelhaemel.local",
  "seed.motoboy.custodia@abelhaemel.local",
  ...Array.from(
    { length: 12 },
    (_, index) => `seed.cliente.${index + 1}.custodia@abelhaemel.local`,
  ),
];

const validationProducts = [
  "Caixa Premium Seed",
  "Mel Artesanal Seed",
  "Caixa Fluxo Completo Real",
  "Caixa Dinheiro com Troco Seed",
  "Caixa Validacao Custodia",
];

const validationCategories = [
  "Seed Tracking Realtime",
  "Seed Fluxo Completo Real",
  "Seed Checkout Real",
  "Seed Custodia Bairros",
];

async function deleteOrdersByMarker(marker) {
  const { data: orders, error: ordersError } = await adminClient
    .from("pedidos")
    .select("id")
    .ilike("observacoes", `%${marker}%`);
  if (ordersError) throw ordersError;

  const orderIds = (orders ?? []).map((order) => order.id);
  if (!orderIds.length) return 0;

  await deleteByOrderIds("rotas_entrega", "pedido_id", orderIds);
  await deleteByOrderIds("entregas", "pedido_id", orderIds);
  await deleteByOrderIds("pedido_itens", "pedido_id", orderIds);
  await deleteByOrderIds("lancamentos_financeiros", "pedido_id", orderIds);

  const { error: deleteOrdersError } = await adminClient
    .from("pedidos")
    .delete()
    .in("id", orderIds);
  if (deleteOrdersError) throw deleteOrdersError;

  return orderIds.length;
}

async function deleteByOrderIds(table, column, orderIds) {
  const { error } = await adminClient.from(table).delete().in(column, orderIds);
  if (error) throw error;
}

async function deleteProducts() {
  const { data: products, error: productsError } = await adminClient
    .from("produtos")
    .select("id")
    .in("nome", validationProducts);
  if (productsError) throw productsError;

  const productIds = (products ?? []).map((product) => product.id);
  if (productIds.length) {
    const { data: items, error: itemsError } = await adminClient
      .from("pedido_itens")
      .select("pedido_id")
      .in("produto_id", productIds);
    if (itemsError) throw itemsError;

    const orderIds = [...new Set((items ?? []).map((item) => item.pedido_id))];
    if (orderIds.length) {
      await deleteOrdersByIds(orderIds);
    }
  }

  const { error } = await adminClient.from("produtos").delete().in("nome", validationProducts);
  if (error) throw error;
}

async function deleteOrdersByIds(orderIds) {
  await deleteByOrderIds("rotas_entrega", "pedido_id", orderIds);
  await deleteByOrderIds("entregas", "pedido_id", orderIds);
  await deleteByOrderIds("pedido_itens", "pedido_id", orderIds);
  await deleteByOrderIds("lancamentos_financeiros", "pedido_id", orderIds);

  const { error } = await adminClient.from("pedidos").delete().in("id", orderIds);
  if (error) throw error;
}

async function deleteCategories() {
  const { error } = await adminClient.from("categorias").delete().in("nome", validationCategories);
  if (error) throw error;
}

async function deleteValidationUsers() {
  for (const email of validationUsers) {
    await deleteUserByEmail(email);
  }
}

async function main() {
  await cleanupRealtimeTrackingSeed();

  const deletedByMarker = {};
  for (const marker of orderMarkers) {
    deletedByMarker[marker] = await deleteOrdersByMarker(marker);
  }

  await deleteValidationUsers();
  await deleteProducts();
  await deleteCategories();

  console.log("CLEANUP_VALIDATION_SEEDS_OK");
  console.log(
    JSON.stringify(
      {
        deletedByMarker,
        usersChecked: validationUsers.length,
        productsChecked: validationProducts.length,
        categoriesChecked: validationCategories.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("CLEANUP_VALIDATION_SEEDS_FALHOU");
  console.error(error);
  process.exit(1);
});
