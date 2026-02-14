import { config } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";
import { createScheduler } from "./scheduler.js";

const log = createLogger("heartbeat");

async function main() {
  log.action(`Heartbeat started (PID: ${process.pid})`);

  const scheduler = createScheduler();

  const loop = async () => {
    while (true) {
      try {
        scheduler.run();
      } catch (err) {
        log.error(`Heartbeat loop error: ${err}`);
      }
      await new Promise((r) => setTimeout(r, config.heartbeatInterval));
    }
  };

  loop();

  // Graceful shutdown
  const cleanup = () => {
    log.action("Heartbeat shutting down");
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((e) => {
  console.error("Heartbeat fatal error:", e);
  process.exit(1);
});
