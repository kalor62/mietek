import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export const config = {
  ownerJid: process.env.OWNER_JID || "",
  ownerName: process.env.OWNER_NAME || "User",
  botName: process.env.BOT_NAME || "Mietek",
  triggerWord: process.env.TRIGGER_WORD || "HeyMietek",
  quietHourStart: Number(process.env.QUIET_HOUR_START) || 23,
  quietHourEnd: Number(process.env.QUIET_HOUR_END) || 7,
  dbPath: path.join(process.cwd(), "data", "mietek.db"),
  waAuthPath: path.join(process.cwd(), "data", "wa-auth"),
  mcpConfigPath: path.join(process.cwd(), "mcp-config.json"),
  claudeTimeout: 1_200_000, // 20 min
  maxTurns: 1000,
  pollInterval: 2_000, // 2s
  heartbeatInterval: 60_000, // 1 min
  maxMessageLength: 4000, // WhatsApp chunk size
};

// Validate required config on startup (skip during setup)
const isSetup = process.argv.some((arg) => arg.includes("setup"));
if (!isSetup) {
  if (!config.ownerJid) {
    console.error(
      "ERROR: OWNER_JID is not set in .env\n" +
        "Run 'npm run setup' to connect WhatsApp and get your JID,\n" +
        "then add OWNER_JID=<your-jid> to the .env file."
    );
    process.exit(1);
  }

  if (!config.ownerJid.endsWith("@s.whatsapp.net")) {
    console.error(
      `ERROR: OWNER_JID has invalid format: "${config.ownerJid}"\n` +
        "Expected format: <phone>@s.whatsapp.net (e.g. 48123456789@s.whatsapp.net)"
    );
    process.exit(1);
  }
}
