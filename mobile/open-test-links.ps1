$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$ipv4Matches = ipconfig | Select-String -Pattern 'IPv4'
$lanIp = $null

foreach ($match in $ipv4Matches) {
  if ($match.Line -match '(\d{1,3}(\.\d{1,3}){3})') {
    $candidate = $matches[1]
    if ($candidate -like '192.168.*' -or $candidate -like '10.*' -or $candidate -like '172.*') {
      if ($candidate -ne '192.168.137.1') {
        $lanIp = $candidate
        break
      }
    }
  }
}

if (-not $lanIp) {
  throw 'Nao foi possivel detectar um IP local para o Expo Go.'
}

$qrHtmlPath = Join-Path $projectRoot 'qr-code.html'
$expUrl = "exp://$lanIp`:8081"
$webUrl = 'http://localhost:19006'
$qrUrl = "https://quickchart.io/qr?size=320&text=$([uri]::EscapeDataString($expUrl))"

$html = @"
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NorFood Entregador</title>
    <style>
      :root {
        --orange: #ff7a00;
        --orange-dark: #ff5a00;
        --orange-soft: #ff9100;
        --surface: #f6f7f9;
        --card: #ffffff;
        --line: #ece7dd;
        --text: #223126;
        --muted: #6d7468;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background:
          radial-gradient(circle at top, rgba(242, 193, 78, 0.18), transparent 28%),
          linear-gradient(180deg, #ffffff 0%, var(--surface) 100%);
        color: var(--text);
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .card {
        width: min(100%, 560px);
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 32px;
        padding: 28px;
        box-shadow: 0 24px 70px rgba(75, 55, 20, 0.12);
        text-align: center;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 34px;
        color: var(--orange);
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }
      .qr-wrap {
        margin: 24px auto 18px;
        width: 320px;
        max-width: 100%;
        padding: 18px;
        border-radius: 28px;
        background: linear-gradient(180deg, #fff, #fbf5e8);
        border: 1px solid var(--line);
      }
      .qr-wrap img {
        display: block;
        width: 100%;
        height: auto;
        border-radius: 18px;
      }
      .links {
        display: grid;
        gap: 12px;
        margin-top: 14px;
        text-align: left;
      }
      .link-card {
        padding: 14px 16px;
        border-radius: 18px;
        background: #f8f2e5;
        border: 1px solid var(--line);
      }
      .link-card strong {
        display: block;
        margin-bottom: 6px;
        color: var(--orange);
      }
      .link-card a {
        color: var(--orange);
        font-weight: 700;
        word-break: break-all;
        text-decoration: none;
      }
      .steps {
        margin-top: 22px;
        text-align: left;
        background: #fffaf0;
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 18px 18px 6px;
      }
      .steps li {
        margin: 0 0 12px;
        color: var(--text);
      }
      .badge {
        display: inline-block;
        margin-top: 16px;
        background: var(--orange);
        color: #fff;
        border-radius: 999px;
        padding: 10px 16px;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>NorFood Entregador</h1>
      <p>Use esta tela para abrir o app no <strong>iPhone via Expo Go</strong> e no <strong>PC via navegador</strong>.</p>
      <div class="badge">Ambiente validado</div>
      <div class="qr-wrap">
        <img src="$qrUrl" alt="QR Code Expo Go" />
      </div>
      <div class="links">
        <div class="link-card">
          <strong>Expo Go no iPhone</strong>
          <a href="$expUrl">$expUrl</a>
        </div>
        <div class="link-card">
          <strong>App no navegador do PC</strong>
          <a href="$webUrl">$webUrl</a>
        </div>
      </div>
      <ol class="steps">
        <li>Deixe o iPhone e o PC na mesma rede Wi-Fi.</li>
        <li>Abra o Expo Go no iPhone e escaneie o QR Code acima.</li>
        <li>No PC, abra o link web para navegar pelo app no navegador.</li>
        <li>Se o iPhone mostrar o aviso para abrir no Expo Go, confirme.</li>
      </ol>
    </main>
  </body>
</html>
"@

Set-Content -LiteralPath $qrHtmlPath -Value $html -Encoding UTF8

Start-Process $webUrl
Start-Process $qrHtmlPath

Write-Output "Expo Go: $expUrl"
Write-Output "Web: $webUrl"
