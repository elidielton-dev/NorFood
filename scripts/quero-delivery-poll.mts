import { pollAllTenantsQueroDelivery } from "../src/lib/integrations/quero-delivery/quero-delivery.sync.server";

const intervalMs = Number(process.env.QUERO_DELIVERY_POLL_MS ?? 45_000);

async function runPoll() {
  const results = await pollAllTenantsQueroDelivery();
  console.log(`[quero-delivery-poll] ${new Date().toISOString()}`, JSON.stringify(results));
}

console.log(`[quero-delivery-poll] iniciando worker a cada ${intervalMs}ms`);
void runPoll().catch((error) => console.error("[quero-delivery-poll]", error));
setInterval(() => {
  void runPoll().catch((error) => console.error("[quero-delivery-poll]", error));
}, intervalMs);
