type SendPlatformEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** cadastro = transacional de conta; contato = suporte/comercial */
  fromKind?: "cadastro" | "contato";
};

export type SendPlatformEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_configured" | "send_failed" | "network_error"; detail?: string };

export function resolvePlatformEmailFrom(kind: "cadastro" | "contato" = "cadastro") {
  if (kind === "contato") {
    return (
      process.env.PLATFORM_EMAIL_CONTACT_FROM?.trim() ??
      process.env.PLATFORM_EMAIL_FROM?.trim() ??
      "Norfood <contato@norfood.com.br>"
    );
  }
  return process.env.PLATFORM_EMAIL_FROM?.trim() ?? "Norfood <cadastro@norfood.com.br>";
}

export async function sendPlatformEmail(args: SendPlatformEmailArgs): Promise<SendPlatformEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = resolvePlatformEmailFrom(args.fromKind ?? "cadastro");

  if (!apiKey) {
    console.warn("[platform-email] RESEND_API_KEY não configurada — e-mail não enviado.", args.to);
    return { ok: false, reason: "not_configured" };
  }

  try {
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

    const body = await response.text();
    if (!response.ok) {
      console.error("[platform-email] falha:", args.to, args.subject, body);
      return { ok: false, reason: "send_failed", detail: body };
    }

    let id = "unknown";
    try {
      id = (JSON.parse(body) as { id?: string }).id ?? id;
    } catch {
      // ignore parse errors
    }
    console.info("[platform-email] enviado:", args.to, args.subject, id);
    return { ok: true, id };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[platform-email] erro de rede:", args.to, detail);
    return { ok: false, reason: "network_error", detail };
  }
}
