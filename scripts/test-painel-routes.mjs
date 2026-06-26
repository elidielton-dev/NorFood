import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:5173";
const routes = [
  ["dashboard", "Dashboard"],
  ["kds", "KDS"],
  ["produtos", "Produtos"],
  ["pdv", "PDV"],
  ["atendimento/conversas", "Atendimento"],
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let failed = 0;

for (const [seg, label] of routes) {
  const pageErrors = [];
  page.removeAllListeners("pageerror");
  page.on("pageerror", (e) => pageErrors.push(e.message));

  const url = `${base}/t/norfood/${seg}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const body = await page.locator("body").innerText();
  const broken =
    body.includes("This page didn't load") ||
    pageErrors.some((e) => e.includes("Invariant failed") || e.includes("is not defined"));

  if (broken) {
    failed++;
    console.log(`FAIL ${seg}:`, pageErrors[0] ?? "error page");
  } else {
    console.log(`OK   ${seg}`);
  }
}

await browser.close();
process.exit(failed > 0 ? 1 : 0);
