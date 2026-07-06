import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import { createServer } from "./routes.js";

async function main() {
  const { port } = getConfig();
  const server = createServer();

  server.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "whatsapp-gateway listening");
  });
}

main().catch((error) => {
  logger.error({ error }, "fatal");
  process.exit(1);
});
