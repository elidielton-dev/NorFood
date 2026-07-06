import http from "node:http";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import {
  connectWithPairing,
  connectWithQr,
  ensureReady,
  fetchChatsFromSocket,
  fetchContactsFromSocket,
  getAllStoredMessages,
  getConnectionState,
  getSnapshot,
  getStoredMessages,
  logoutSession,
  refreshPairingCode,
  resetSession,
  startSession,
} from "./session.js";
import { downloadMedia, fetchProfilePicture, sendAudio, sendMedia, sendText } from "./send.js";

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function isAuthorized(req: http.IncomingMessage) {
  const { gatewayKey } = getConfig();
  if (!gatewayKey) {
    return process.env.NODE_ENV !== "production";
  }
  const header =
    req.headers.apikey ??
    req.headers["x-api-key"] ??
    req.headers.authorization?.replace(/^Bearer\s+/i, "");
  return String(header ?? "").trim() === gatewayKey;
}

function unauthorized(res: http.ServerResponse) {
  return json(res, 401, { ok: false, error: "unauthorized" });
}

export function createServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const method = req.method ?? "GET";
    const path = url.pathname;

    if (path === "/health" && method === "GET") {
      const snapshot = getSnapshot();
      return json(res, 200, {
        ok: true,
        connection: snapshot.connectionState,
        configured: getConfig().enabled,
      });
    }

    if (!isAuthorized(req)) return unauthorized(res);

    try {
      if (path === "/connection" && method === "GET") {
        const state = getConnectionState();
        const mapped =
          state === "connected" ? "open" : state === "connecting" ? "connecting" : "close";
        return json(res, 200, { state: mapped, instance: { state: mapped } });
      }

      if (path === "/connect/qr" && method === "POST") {
        const snapshot = await connectWithQr();
        return json(res, 200, {
          qrcode: snapshot.qrCode,
          base64: snapshot.qrCode,
          pairingCode: snapshot.pairingCode,
          lastAuthError: snapshot.lastAuthError,
          connection: snapshot.connectionState,
        });
      }

      if (path === "/connect/pairing" && method === "POST") {
        const body = JSON.parse(await readBody(req));
        const phone = String(body.phone ?? body.number ?? "");
        const snapshot = await connectWithPairing(phone);
        return json(res, 200, {
          pairingCode: snapshot.pairingCode,
          pairing_code: snapshot.pairingCode,
        });
      }

      if (path === "/connect/pairing/refresh" && method === "POST") {
        const body = JSON.parse(await readBody(req));
        const phone = String(body.phone ?? body.number ?? "");
        const snapshot = await refreshPairingCode(phone);
        return json(res, 200, {
          pairingCode: snapshot.pairingCode,
          pairing_code: snapshot.pairingCode,
        });
      }

      if (path === "/connect/qr/snapshot" && method === "GET") {
        const snapshot = getSnapshot();
        return json(res, 200, {
          qrcode: snapshot.qrCode,
          base64: snapshot.qrCode,
          pairingCode: snapshot.pairingCode,
          connection: snapshot.connectionState,
          lastAuthError: snapshot.lastAuthError,
        });
      }

      if (path === "/connect/pairing/snapshot" && method === "GET") {
        const snapshot = getSnapshot();
        return json(res, 200, { pairingCode: snapshot.pairingCode });
      }

      if (path === "/disconnect" && method === "POST") {
        await logoutSession();
        return json(res, 200, { ok: true });
      }

      if (path === "/logout" && method === "POST") {
        await logoutSession();
        return json(res, 200, { ok: true });
      }

      if (path === "/reset" && method === "POST") {
        const snapshot = await resetSession();
        return json(res, 200, snapshot);
      }

      if (path === "/session/start" && method === "POST") {
        const snapshot = await startSession({ reconnect: true });
        return json(res, 200, snapshot);
      }

      if (path === "/profile" && method === "GET") {
        const snapshot = getSnapshot();
        return json(res, 200, {
          profileName: snapshot.profileName,
          phoneNumber: snapshot.phoneNumber,
          ownerJid: snapshot.ownerJid,
          wuid: snapshot.ownerJid,
        });
      }

      if (path === "/chats" && method === "GET") {
        await ensureReady();
        const chats = await fetchChatsFromSocket();
        return json(res, 200, chats);
      }

      if (path === "/contacts" && method === "GET") {
        await ensureReady();
        const contacts = await fetchContactsFromSocket();
        return json(res, 200, contacts);
      }

      if (path === "/messages" && method === "GET") {
        const jid = url.searchParams.get("jid") ?? "";
        const limit = Number(url.searchParams.get("limit") ?? "80");
        if (jid) {
          return json(res, 200, { messages: { records: getStoredMessages(jid, limit) } });
        }
        return json(res, 200, { messages: { records: getAllStoredMessages(limit) } });
      }

      if (path === "/message/text" && method === "POST") {
        const body = JSON.parse(await readBody(req));
        const result = await sendText(String(body.number ?? ""), String(body.text ?? ""), body.quoted);
        return json(res, 200, { ok: true, result });
      }

      if (path === "/message/media" && method === "POST") {
        const body = JSON.parse(await readBody(req));
        const result = await sendMedia({
          number: String(body.number ?? ""),
          mediatype: body.mediatype,
          media: String(body.media ?? ""),
          mimetype: body.mimetype,
          caption: body.caption,
          fileName: body.fileName,
        });
        return json(res, 200, { ok: true, result });
      }

      if (path === "/message/audio" && method === "POST") {
        const body = JSON.parse(await readBody(req));
        const result = await sendAudio(
          String(body.number ?? ""),
          String(body.audio ?? body.media ?? ""),
          body.mimetype ? String(body.mimetype) : undefined,
        );
        return json(res, 200, { ok: true, result });
      }

      if (path === "/media/download" && method === "POST") {
        const body = JSON.parse(await readBody(req));
        const result = await downloadMedia({
          remoteJid: body.remoteJid,
          waMessageId: String(body.waMessageId ?? ""),
          fromMe: body.fromMe,
          webhookRecord: body.webhookRecord ?? body.message,
        });
        return json(res, 200, result ?? { base64: null });
      }

      if (path === "/profile-picture" && method === "POST") {
        const body = JSON.parse(await readBody(req));
        const urlResult = await fetchProfilePicture(String(body.number ?? ""));
        return json(res, 200, { profilePictureUrl: urlResult, url: urlResult });
      }

      return json(res, 404, { ok: false, error: "not_found" });
    } catch (error) {
      logger.error({ error, path, method }, "request failed");
      const message = error instanceof Error ? error.message : String(error);
      return json(res, 500, { ok: false, error: message });
    }
  });

  return server;
}
