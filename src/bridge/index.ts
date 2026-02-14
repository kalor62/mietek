import { connectWhatsApp } from "./whatsapp.js";
import { pollAndSendResponses, sendApprovedOutbound, showTypingForProcessing } from "./sender.js";
import { config } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("bridge");

async function main() {
  log.action(`Bridge started (PID: ${process.pid})`);

  // Connect to WhatsApp
  await connectWhatsApp();

  // Poll for completed messages to send
  const sendLoop = async () => {
    while (true) {
      try {
        await showTypingForProcessing();
        await pollAndSendResponses();
        await sendApprovedOutbound();
      } catch (err) {
        log.error(`Send loop error: ${err}`);
      }
      await new Promise((r) => setTimeout(r, config.pollInterval));
    }
  };

  sendLoop();

  // Graceful shutdown
  const cleanup = () => {
    log.action("Bridge shutting down");
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((e) => {
  console.error("Bridge fatal error:", e);
  process.exit(1);
});
