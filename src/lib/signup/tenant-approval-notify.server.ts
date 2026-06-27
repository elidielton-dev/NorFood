import { sendPlatformEmail } from "@/lib/notifications/platform-email.server";
import { formatBrazilPhone } from "@/lib/signup/signup-phone";
import { tenantPath } from "@/lib/tenant/painel-routes";

async function sendPlatformWhatsApp(phone: string, text: string) {
  try {
    const { getActiveProvider } = await import("@/lib/atendimento/atendimento-provider.server");
    const provider = await getActiveProvider();

    if (provider === "evolution") {
      const { sendEvolutionText } = await import("@/lib/api/whatsapp-evolution.server");
      const digits = phone.replace(/\D/g, "");
      await sendEvolutionText(digits, text);
      return { ok: true as const, channel: "evolution" as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decrypt } = await import("@/lib/waba/encryption");
    const { sendTextMessageToPhone } = await import("@/lib/waba/meta-api");
    const { WABA_WORKSPACE_ID } = await import("@/lib/waba/types");

    const { data: config } = await supabaseAdmin
      .from("waba_config")
      .select("phone_number_id, access_token")
      .eq("workspace_id", WABA_WORKSPACE_ID)
      .maybeSingle();

    if (!config?.access_token || !config.phone_number_id) {
      console.warn("[tenant-approval] WhatsApp não configurado.");
      return { ok: false as const, reason: "not_configured" as const };
    }

    await sendTextMessageToPhone({
      phoneNumberId: config.phone_number_id,
      accessToken: decrypt(config.access_token),
      phone,
      text,
    });
    return { ok: true as const, channel: "meta" as const };
  } catch (error) {
    console.error("[tenant-approval] WhatsApp falhou:", error);
    return { ok: false as const, reason: "send_failed" as const };
  }
}

export async function notifyTenantSignupReceived(args: {
  email: string;
  ownerName: string;
  restaurantName: string;
  phone?: string | null;
}) {
  const subject = "Recebemos seu cadastro — Norfood";
  const html = `
    <p>Olá, ${args.ownerName}!</p>
    <p>Recebemos o cadastro do restaurante <strong>${args.restaurantName}</strong>.</p>
    <p>Nossa equipe analisa novos cadastros em até algumas horas. Assim que aprovado, você receberá outro e-mail e uma mensagem no WhatsApp com o link de acesso ao painel.</p>
    <p>Enquanto isso, não é necessário fazer nada — avisaremos você.</p>
    <p>Equipe Norfood</p>
  `;

  await sendPlatformEmail({ to: args.email, subject, html, text: subject });
}

export async function notifyTenantApproved(args: {
  email: string;
  ownerName: string;
  restaurantName: string;
  slug: string;
  phone?: string | null;
}) {
  const appUrl = (process.env.PUBLIC_APP_URL ?? "https://norfood.com.br").replace(/\/$/, "");
  const painelUrl = `${appUrl}${tenantPath(args.slug, "dashboard")}`;
  const lojaUrl = `${appUrl}/loja/${args.slug}`;

  const subject = `Seu restaurante ${args.restaurantName} está ativo!`;
  const html = `
    <p>Olá, ${args.ownerName}!</p>
    <p>Boas notícias: o cadastro de <strong>${args.restaurantName}</strong> foi aprovado e já está ativo.</p>
    <p><a href="${painelUrl}">Acessar painel</a></p>
    <p>Sua loja online: <a href="${lojaUrl}">${lojaUrl}</a></p>
    <p>Você tem 14 dias de trial para explorar todos os recursos.</p>
    <p>Equipe Norfood</p>
  `;

  const whatsappText = [
    `Olá, ${args.ownerName}! 🎉`,
    ``,
    `Seu cadastro no Norfood foi aprovado.`,
    `Restaurante: ${args.restaurantName}`,
    ``,
    `Acesse o painel: ${painelUrl}`,
    `Loja online: ${lojaUrl}`,
    ``,
    `Trial de 14 dias ativo. Qualquer dúvida, responda esta mensagem.`,
  ].join("\n");

  const [emailResult, whatsappResult] = await Promise.all([
    sendPlatformEmail({ to: args.email, subject, html, text: `${subject} ${painelUrl}` }),
    args.phone ? sendPlatformWhatsApp(args.phone, whatsappText) : Promise.resolve({ ok: false as const }),
  ]);

  return { email: emailResult, whatsapp: whatsappResult };
}

export async function notifyTenantRejected(args: {
  email: string;
  ownerName: string;
  restaurantName: string;
  reason?: string | null;
  phone?: string | null;
}) {
  const subject = "Atualização sobre seu cadastro — Norfood";
  const reasonText = args.reason?.trim()
    ? `<p>Motivo: ${args.reason.trim()}</p>`
    : "";
  const html = `
    <p>Olá, ${args.ownerName}.</p>
    <p>Após análise, não foi possível aprovar o cadastro de <strong>${args.restaurantName}</strong> neste momento.</p>
    ${reasonText}
    <p>Se acredita que houve um engano, responda este e-mail ou fale conosco pelo WhatsApp.</p>
    <p>Equipe Norfood</p>
  `;

  const whatsappText = [
    `Olá, ${args.ownerName}.`,
    ``,
    `Sobre o cadastro de ${args.restaurantName} no Norfood: não foi possível aprovar neste momento.`,
    args.reason?.trim() ? `Motivo: ${args.reason.trim()}` : "",
    ``,
    `Entre em contato conosco se precisar de ajuda.`,
  ]
    .filter(Boolean)
    .join("\n");

  await Promise.all([
    sendPlatformEmail({ to: args.email, subject, html }),
    args.phone ? sendPlatformWhatsApp(formatBrazilPhone(args.phone), whatsappText) : Promise.resolve(null),
  ]);
}
