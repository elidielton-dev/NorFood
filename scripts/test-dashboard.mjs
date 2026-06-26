import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:8082/t/norfood/dashboard";
const errors = [];
const pageErrors = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("pageerror", (err) => pageErrors.push(String(err)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(3000);

const bodyText = await page.locator("body").innerText();
const hasErrorPage = bodyText.includes("This page didn't load");
const hasDashboard = bodyText.includes("Dashboard") || bodyText.includes("Vendas do dia");

console.log("URL:", url);
console.log("Error page:", hasErrorPage);
console.log("Dashboard visible:", hasDashboard);
console.log("Body snippet:", bodyText.slice(0, 500).replace(/\s+/g, " "));
if (pageErrors.length) console.log("Page errors:", pageErrors);
if (errors.length) console.log("Console errors:", errors.slice(0, 10));

await browser.close();
process.exit(hasErrorPage ? 1 : 0);
