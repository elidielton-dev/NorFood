type SendPlatformEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendPlatformEmail(args: SendPlatformEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.PLATFORM_EMAIL_FROM?.trim() ?? "Norfood <cadastro@norfood.com.br>";

  if (!apiKey) {
    console.warn("[platform-email] RESEND_API_KEY não configurada — e-mail não enviado.", args.to);
    return { ok: false as const, reason: "not_configured" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[platform-email] falha:", detail);
    return { ok: false as const, reason: "send_failed" as const };
  }

  return { ok: true as const };
}
