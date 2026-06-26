const BASE_URL = process.env.DEMO_SYNC_BASE_URL ?? "http://127.0.0.1:4318";
const CUSTOMER_LATITUDE = -8.0874;
const CUSTOMER_LONGITUDE = -37.6392;

async function request(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed with ${response.status}`);
  }

  return response.json();
}

async function main() {
  await request("/reset", { method: "POST", body: "{}" });

  const pedido = await request("/demo/pedidos", {
    method: "POST",
    body: JSON.stringify({
      canal: "delivery",
      forma_pagamento: "pix",
      endereco: "Rua Jose Estrela, 1000",
      reference: "Proximo ao cartorio",
      bairro: "Centro",
      city: "Custodia/PE",
      latitude_cliente: CUSTOMER_LATITUDE,
      longitude_cliente: CUSTOMER_LONGITUDE,
      observacoes: "Validacao automatica ponta a ponta",
      customerName: "Cliente Validacao Custodia",
      customerPhone: "(87) 99888-0000",
      itens: [
        { produto_id: "prod-1", quantidade: 1, preco_unitario: 84.9 },
        { produto_id: "prod-2", quantidade: 2, preco_unitario: 6.5 },
      ],
    }),
  });

  await request(`/demo/pedidos/${pedido.id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "em_preparo" }),
  });

  await request(`/demo/pedidos/${pedido.id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "pronto" }),
  });

  const entregas = await request("/demo/entregas");
  const entrega = entregas.find((item) => item.pedido_id === pedido.id);
  if (!entrega || entrega.status !== "disponivel") {
    throw new Error("Entrega nao ficou disponivel apos o KDS marcar como pronto.");
  }

  const riderBefore = await request("/demo/rider-app/state?riderId=demo-motoboy");
  const readyNotification = riderBefore.notifications.find((item) => item.deliveryId === entrega.id);
  if (!readyNotification) {
    throw new Error("Notificacao de pedido pronto nao foi entregue ao app do entregador.");
  }

  await request(`/demo/entregas/${entrega.id}/accept`, {
    method: "PATCH",
    body: JSON.stringify({ riderId: "demo-motoboy" }),
  });

  await request(`/demo/entregas/${entrega.id}/location`, {
    method: "POST",
    body: JSON.stringify({
      riderId: "demo-motoboy",
      latitude: -8.0845,
      longitude: -37.6385,
      speed: 7.8,
      heading: 145,
      accuracy: 8,
      battery: 81,
      status: "em_rota",
    }),
  });

  await request(`/demo/entregas/${entrega.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      riderId: "demo-motoboy",
      templateId: "way",
      text: "Oi. Estou a caminho com o seu pedido da Abelha & Mel.",
    }),
  });

  await request(`/demo/entregas/${entrega.id}/incidents`, {
    method: "POST",
    body: JSON.stringify({
      riderId: "demo-motoboy",
      type: "Transito",
      note: "Teste automatizado de ocorrencia.",
    }),
  });

  await request(`/demo/entregas/${entrega.id}/advance`, {
    method: "PATCH",
    body: JSON.stringify({ step: "arrived_store" }),
  });

  await request(`/demo/entregas/${entrega.id}/advance`, {
    method: "PATCH",
    body: JSON.stringify({ step: "picked_up" }),
  });

  await request(`/demo/entregas/${entrega.id}/advance`, {
    method: "PATCH",
    body: JSON.stringify({ step: "arrived_customer" }),
  });

  await request(`/demo/entregas/${entrega.id}/advance`, {
    method: "PATCH",
    body: JSON.stringify({ step: "delivered" }),
  });

  const pedidosFinais = await request("/demo/pedidos");
  const pedidoFinal = pedidosFinais.find((item) => item.id === pedido.id);
  const entregasFinais = await request("/demo/entregas");
  const entregaFinal = entregasFinais.find((item) => item.id === entrega.id);
  const riderAfter = await request("/demo/rider-app/state?riderId=demo-motoboy");
  const tracking = await request(`/demo/tracking/order?orderId=${pedido.id}`);

  if (pedidoFinal?.status !== "entregue") {
    throw new Error("Pedido nao foi concluido no fluxo final.");
  }

  if (entregaFinal?.status !== "entregue") {
    throw new Error("Entrega nao foi concluida no fluxo final.");
  }

  const finalMessage = riderAfter.messages.find((item) => item.deliveryId === entrega.id);
  const finalIncident = riderAfter.incidents.find((item) => item.deliveryId === entrega.id);

  if (!finalMessage) {
    throw new Error("Mensagem rapida do entregador nao foi registrada.");
  }

  if (!finalIncident) {
    throw new Error("Ocorrencia do entregador nao foi registrada.");
  }

  if (tracking.status !== "entregue") {
    throw new Error("Tracking final nao refletiu o status entregue.");
  }

  console.log("VALIDACAO_OK");
  console.log(JSON.stringify({
    pedido: { numero: pedidoFinal.numero, status: pedidoFinal.status },
    entrega: { id: entregaFinal.id, status: entregaFinal.status },
    tracking: { etaMinutes: tracking.etaMinutes, remainingKm: tracking.remainingKm, rider: tracking.riderName },
    notificacoesNaoLidas: riderAfter.notifications.filter((item) => !item.readAt).length,
    mensagens: riderAfter.messages.length,
    ocorrencias: riderAfter.incidents.length,
  }, null, 2));
}

main().catch((error) => {
  console.error("VALIDACAO_FALHOU");
  console.error(error);
  process.exit(1);
});
