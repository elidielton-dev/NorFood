#!/usr/bin/env node
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function detectLanIp() {
  try {
    const out = execSync("ipconfig", { encoding: "utf8" });
    for (const line of out.split(/\r?\n/)) {
      const match = line.match(/IPv4[^:]*:\s*(\d+\.\d+\.\d+\.\d+)/);
      if (!match) continue;
      const ip = match[1];
      if (
        (ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.")) &&
        ip !== "192.168.137.1"
      ) {
        return ip;
      }
    }
  } catch {
    /* optional */
  }
  return null;
}

const port = process.env.EXPO_METRO_PORT ?? process.env.EXPO_PORT ?? "8081";
const host =
  process.env.EXPO_METRO_HOST ??
  process.env.NORFOOD_VPS_HOST ??
  detectLanIp() ??
  "15.228.214.190";
const expUrl = process.env.EXPO_URL ?? process.env.EXPO_GO_URL ?? `exp://${host}:${port}`;
const mode =
  process.env.EXPO_URL || process.env.EXPO_GO_URL
    ? "custom"
    : host === "15.228.214.190"
      ? "vps"
      : "lan";

const pngPath = resolve(root, "public/expo-go-qr.png");
const htmlPath = resolve(root, "public/expo-go-qr.html");

await QRCode.toFile(pngPath, expUrl, { width: 400, margin: 2, color: { dark: "#223126", light: "#ffffff" } });

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NorFood Entregador — Expo Go</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #faf5eb; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 24px; }
    main { max-width: 420px; background: #fff; border-radius: 24px; padding: 28px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.08); }
    h1 { color: #3d5a40; font-size: 1.5rem; }
    img { width: 320px; max-width: 100%; border-radius: 16px; margin: 16px 0; }
    a { color: #3d5a40; font-weight: 700; word-break: break-all; }
    p, li { color: #6d7468; line-height: 1.5; text-align: left; }
    ol { padding-left: 1.2rem; }
  </style>
</head>
<body>
  <main>
    <h1>App Entregador — Expo Go</h1>
    <p style="text-align:center">Escaneie com o <strong>Expo Go</strong> (${mode}).</p>
    <img src="expo-go-qr.png" alt="QR Code Expo Go" />
    <p style="text-align:center"><a href="${expUrl}">${expUrl}</a></p>
    <ol>
      <li>Instale o app <strong>Expo Go</strong> no celular.</li>
      <li>Abra o Expo Go e escaneie o QR (nao use a camera comum).</li>
      <li>Faca login com e-mail e senha do entregador.</li>
    </ol>
  </main>
</body>
</html>`;

writeFileSync(htmlPath, html, "utf8");

console.log(JSON.stringify({ host, port, expUrl, mode, pngPath, htmlPath }, null, 2));
