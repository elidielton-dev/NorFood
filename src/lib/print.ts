import QRCode from "qrcode";

export async function printMesaQrCode(input: {
  url: string;
  mesaNumero: number;
  tenantName: string;
}) {
  const qrDataUrl = await QRCode.toDataURL(input.url, {
    width: 360,
    margin: 2,
    color: { dark: "#111111", light: "#ffffff" },
  });

  const bodyHtml = `
    <div style="text-align:center;font-family:Inter,Segoe UI,sans-serif;color:#111111;">
      <p style="font-size:16px;font-weight:600;margin:0 0 6px;letter-spacing:0.04em;text-transform:uppercase;">
        ${escapeHtml(input.tenantName)}
      </p>
      <p style="font-size:32px;font-weight:800;margin:0 0 28px;">Mesa ${input.mesaNumero}</p>
      <img
        src="${qrDataUrl}"
        alt="QR Code Mesa ${input.mesaNumero}"
        style="width:280px;height:280px;display:block;margin:0 auto 24px;"
      />
      <p style="font-size:15px;font-weight:600;margin:0 0 8px;">Escaneie para ver o cardápio</p>
      <p style="font-size:11px;margin:0;color:#6b7280;word-break:break-all;">${escapeHtml(input.url)}</p>
    </div>
  `;

  await printHtmlReceipt(`Mesa ${input.mesaNumero} — QR Code`, bodyHtml);
}

export async function printHtmlReceipt(title: string, bodyHtml: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");

  document.body.appendChild(iframe);

  const printDocument = iframe.contentWindow?.document;
  if (!printDocument || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    throw new Error("Nao foi possivel iniciar a impressao do recibo.");
  }

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #403734;
        font-family: "Courier New", monospace;
      }
      body {
        padding: 24px;
      }
      .receipt-shell {
        width: min(100%, 560px);
        margin: 0 auto;
      }
      @page {
        size: auto;
        margin: 10mm;
      }
      @media print {
        body {
          padding: 0;
        }
        .receipt-shell {
          width: auto;
          margin: 0;
        }
      }
    </style>
  </head>
  <body>
    <div class="receipt-shell">${bodyHtml}</div>
  </body>
</html>`;

  printDocument.open();
  printDocument.write(html);
  printDocument.close();

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    setTimeout(() => resolve(), 250);
  });

  iframe.contentWindow.focus();
  iframe.contentWindow.print();

  setTimeout(() => {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }, 1000);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
