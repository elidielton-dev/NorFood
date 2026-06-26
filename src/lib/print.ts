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
