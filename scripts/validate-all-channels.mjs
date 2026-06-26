import { spawn } from "node:child_process";

const steps = [
  "validate:real-mesas-panel",
  "validate:real-balcao",
  "validate:real-checkout",
  "validate:real-complete-delivery",
  "validate:produtos-module",
  "validate:production",
];

function runStep(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", script], {
      stdio: "inherit",
      shell: true,
      cwd: process.cwd(),
    });
    child.on("close", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${script} falhou com codigo ${code}`));
    });
  });
}

async function main() {
  console.log("Iniciando validacao completa mesa + balcao + delivery...");
  for (const step of steps) {
    console.log(`\n>> ${step}`);
    await runStep(step);
  }
  console.log("\nVALIDACAO_ALL_CHANNELS_OK");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
