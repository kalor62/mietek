import { processingLoop } from "./loop.js";

const cleanup = () => {
  console.log("[PROCESSOR] Shutting down");
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

processingLoop().catch((e) => {
  console.error("Processor fatal error:", e);
  process.exit(1);
});
