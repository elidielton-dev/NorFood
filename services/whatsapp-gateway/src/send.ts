import { downloadMediaMessage } from "@whiskeysockets/baileys";
import type { WAMessage, WASocket } from "@whiskeysockets/baileys";
import { getSocket, ensureReady, findStoredMessages, getConnectionState } from "./session.js";

function normalizeJid(numberOrJid: string) {
  const raw = numberOrJid.trim();
  if (raw.endsWith("@s.whatsapp.net") || raw.endsWith("@lid")) return raw;
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

function buildQuoted(quoted?: {
  key: { id: string; remoteJid: string; fromMe: boolean };
  message: Record<string, unknown>;
}) {
  if (!quoted) return undefined;
  return {
    key: {
      remoteJid: quoted.key.remoteJid,
      fromMe: quoted.key.fromMe,
      id: quoted.key.id,
    },
    message: quoted.message,
  } as WAMessage;
}

function assertConnected(sock: WASocket | null): WASocket {
  if (!sock || getConnectionState() !== "connected") {
    throw new Error("WhatsApp nao conectado. Escaneie o QR Code ou aguarde a sessao ficar online.");
  }
  return sock;
}

function assertSent(result: WAMessage | undefined) {
  if (!result?.key?.id) {
    throw new Error("WhatsApp nao confirmou o envio da mensagem.");
  }
  return result;
}

export async function sendText(
  numberOrJid: string,
  text: string,
  quoted?: {
    key: { id: string; remoteJid: string; fromMe: boolean };
    message: Record<string, unknown>;
  },
) {
  await ensureReady();
  const sock = assertConnected(getSocket());

  const jid = normalizeJid(numberOrJid);
  const result = await sock.sendMessage(jid, { text }, { quoted: buildQuoted(quoted) });
  return assertSent(result);
}

export async function sendMedia(input: {
  number: string;
  mediatype: "image" | "document" | "audio" | "video";
  media: string;
  mimetype?: string;
  caption?: string;
  fileName?: string;
}) {
  await ensureReady();
  const sock = assertConnected(getSocket());

  const jid = normalizeJid(input.number);
  const buffer = Buffer.from(
    input.media.replace(/^data:[^;]+;base64,/, ""),
    "base64",
  );

  const mimetype = input.mimetype ?? "application/octet-stream";
  const isVoiceNote = input.mediatype === "audio" && /ogg|opus/i.test(mimetype);

  switch (input.mediatype) {
    case "image":
      return assertSent(
        await sock.sendMessage(jid, {
          image: buffer,
          mimetype: mimetype || "image/jpeg",
          caption: input.caption,
        }),
      );
    case "video":
      return assertSent(
        await sock.sendMessage(jid, {
          video: buffer,
          mimetype: mimetype || "video/mp4",
          caption: input.caption,
        }),
      );
    case "audio":
      if (isVoiceNote) {
        return assertSent(
          await sock.sendMessage(jid, {
            audio: buffer,
            mimetype,
            ptt: true,
          }),
        );
      }
      return assertSent(
        await sock.sendMessage(jid, {
          document: buffer,
          mimetype: mimetype || "audio/webm",
          fileName: input.fileName ?? "audio.webm",
          caption: input.caption,
        }),
      );
    case "document":
    default:
      return assertSent(
        await sock.sendMessage(jid, {
          document: buffer,
          mimetype,
          fileName: input.fileName ?? "arquivo",
          caption: input.caption,
        }),
      );
  }
}

export async function sendAudio(
  number: string,
  audioBase64: string,
  mimetype = "audio/webm",
) {
  return sendMedia({
    number,
    mediatype: "audio",
    media: audioBase64,
    mimetype,
    fileName: mimetype.includes("webm") ? "audio.webm" : "audio.ogg",
  });
}

export async function downloadMedia(input: {
  remoteJid?: string;
  waMessageId: string;
  fromMe?: boolean;
  webhookRecord?: Record<string, unknown>;
}) {
  await ensureReady();
  const sock = getSocket();
  if (!sock) throw new Error("WhatsApp nao conectado.");

  let message: WAMessage | undefined;

  if (input.webhookRecord?.key && input.webhookRecord?.message) {
    message = input.webhookRecord as unknown as WAMessage;
  }

  if (!message && input.remoteJid) {
    message = findStoredMessages(input.remoteJid, input.waMessageId);
  }

  if (!message) {
    return null;
  }

  const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
  const buffer = await downloadMediaMessage(message, "buffer", {}, {
    logger: sock.logger,
    reuploadRequest: sock.updateMediaMessage,
  });

  if (!buffer || !Buffer.isBuffer(buffer)) return null;

  const msgContent = message.message ?? {};
  const mediaType = Object.keys(msgContent).find((k) =>
    ["imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage"].includes(k),
  );
  const mediaObj = mediaType ? (msgContent as Record<string, { mimetype?: string }>)[mediaType] : null;

  return {
    base64: buffer.toString("base64"),
    mimetype: mediaObj?.mimetype ?? "application/octet-stream",
  };
}

export async function fetchProfilePicture(numberOrJid: string) {
  await ensureReady();
  const sock = getSocket();
  if (!sock) return null;

  const jid = normalizeJid(numberOrJid);
  try {
    return await sock.profilePictureUrl(jid, "image");
  } catch {
    return null;
  }
}
