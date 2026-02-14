/**
 * Interactive setup wizard for Mietek.
 * Run: npm run setup
 *
 * Steps:
 * 1. Welcome banner
 * 2. Check prerequisites (Node >= 18, claude CLI, pm2)
 * 3. Create .env from .env.example if missing (prompt for OWNER_NAME, TRIGGER_WORD)
 * 4. Create data/ directory
 * 5. WhatsApp QR pairing
 * 6. Auto-detect OWNER_JID and write to .env
 * 7. Test Claude CLI
 * 8. Print next steps
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import path from "path";
import fs from "fs";
import readline from "readline";
import { execSync } from "child_process";
import { silentLogger } from "../src/lib/baileys-logger.js";

const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const WA_AUTH_PATH = path.join(DATA_DIR, "wa-auth");
const ENV_PATH = path.join(ROOT_DIR, ".env");
const ENV_EXAMPLE_PATH = path.join(ROOT_DIR, ".env.example");

// --- Readline helpers ---

function createRL(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// --- Step functions ---

function printBanner(): void {
  console.log("");
  console.log("  __  __ _      _       _    ");
  console.log(" |  \\/  (_) ___| |_ ___| | __");
  console.log(" | |\\/| | |/ _ \\ __/ _ \\ |/ /");
  console.log(" | |  | | |  __/ ||  __/   < ");
  console.log(" |_|  |_|_|\\___|\\__\\___|_|\\_\\");
  console.log("");
  console.log(" AI assistant in WhatsApp, powered by Claude Code");
  console.log(" by Karol Mroszczyk — kmxsoftware.com · @mrok86");
  console.log("");
  console.log("=".repeat(52));
  console.log("");
}

function checkPrerequisites(): boolean {
  console.log("Step 1: Checking prerequisites...\n");
  let allGood = true;

  // Node.js >= 18
  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split(".")[0], 10);
  if (major >= 18) {
    console.log(`  \u2713 Node.js ${nodeVersion} (>= 18 required)`);
  } else {
    console.log(`  \u2717 Node.js ${nodeVersion} — version 18 or higher is required`);
    allGood = false;
  }

  // claude CLI
  try {
    execSync("which claude", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    console.log("  \u2713 claude CLI found in PATH");
  } catch {
    console.log("  \u2717 claude CLI not found in PATH");
    console.log("    Install: https://docs.anthropic.com/en/docs/claude-code");
    allGood = false;
  }

  // pm2
  try {
    execSync("which pm2", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    console.log("  \u2713 pm2 found in PATH");
  } catch {
    console.log("  \u2717 pm2 not found — install with: npm install -g pm2");
    allGood = false;
  }

  console.log("");
  return allGood;
}

async function setupEnv(rl: readline.Interface): Promise<void> {
  console.log("Step 2: Environment configuration...\n");

  if (fs.existsSync(ENV_PATH)) {
    console.log("  .env file already exists, skipping creation.\n");
    return;
  }

  if (!fs.existsSync(ENV_EXAMPLE_PATH)) {
    console.log("  Warning: .env.example not found. Creating minimal .env...\n");
  }

  // Read template
  let template = "";
  if (fs.existsSync(ENV_EXAMPLE_PATH)) {
    template = fs.readFileSync(ENV_EXAMPLE_PATH, "utf8");
  } else {
    template = [
      "OWNER_JID=48XXXXXXXXX@s.whatsapp.net",
      "OWNER_NAME=User",
      "TRIGGER_WORD=HeyMietek",
      "QUIET_HOUR_START=23",
      "QUIET_HOUR_END=7",
    ].join("\n") + "\n";
  }

  // Prompt for OWNER_NAME
  const ownerName = (await ask(rl, "  Your name (used in assistant prompts) [User]: ")) || "User";

  // Prompt for TRIGGER_WORD
  const triggerWord =
    (await ask(rl, "  Trigger word for invoking from any chat [HeyMietek]: ")) || "HeyMietek";

  // Replace values in template
  let envContent = template;
  envContent = envContent.replace(/^OWNER_NAME=.*$/m, `OWNER_NAME=${ownerName}`);
  envContent = envContent.replace(/^TRIGGER_WORD=.*$/m, `TRIGGER_WORD=${triggerWord}`);

  fs.writeFileSync(ENV_PATH, envContent, "utf8");
  console.log(`\n  Created .env with OWNER_NAME=${ownerName}, TRIGGER_WORD=${triggerWord}\n`);
}

function ensureDataDir(): void {
  console.log("Step 3: Ensuring data directory exists...\n");

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log("  Created data/ directory.\n");
  } else {
    console.log("  data/ directory already exists.\n");
  }
}

function updateEnvWithJid(jid: string): void {
  if (!fs.existsSync(ENV_PATH)) {
    // Create minimal .env if somehow missing
    fs.writeFileSync(ENV_PATH, `OWNER_JID=${jid}\n`, "utf8");
    return;
  }

  let content = fs.readFileSync(ENV_PATH, "utf8");

  if (/^OWNER_JID=.*$/m.test(content)) {
    content = content.replace(/^OWNER_JID=.*$/m, `OWNER_JID=${jid}`);
  } else {
    content = `OWNER_JID=${jid}\n` + content;
  }

  fs.writeFileSync(ENV_PATH, content, "utf8");
}

function connectWhatsApp(): Promise<string> {
  return new Promise(async (resolve, reject) => {
    console.log("Step 4: WhatsApp QR pairing...\n");
    console.log("  Scan the QR code below with WhatsApp:\n");
    console.log("    1. Open WhatsApp on your phone");
    console.log("    2. Go to Settings > Linked Devices");
    console.log("    3. Tap 'Link a Device'");
    console.log("    4. Scan the QR code\n");

    try {
      const { state, saveCreds } = await useMultiFileAuthState(WA_AUTH_PATH);
      const { version } = await fetchLatestBaileysVersion();

      console.log(`  Using WA version: ${version.join(".")}\n`);

      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
        },
        version,
        logger: silentLogger,
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log("  Scan this QR code:\n");
          qrcode.generate(qr, { small: true });
        }

        if (connection === "close") {
          const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
          if (reason === DisconnectReason.loggedOut) {
            console.log("\n  Logged out. Please re-run setup to try again.");
            reject(new Error("WhatsApp logged out"));
            return;
          }
          console.log(`\n  Connection closed (${reason}), retrying...`);
          // Clean up old socket before reconnecting
          sock.end(undefined);
          // Re-attempt connection
          connectWhatsApp().then(resolve, reject);
        }

        if (connection === "open") {
          const myJid = sock.user?.id;
          if (!myJid) {
            reject(new Error("Connected but could not detect JID"));
            return;
          }

          // Normalize JID: remove device suffix
          const normalizedJid = myJid.replace(/:\d+@/, "@");

          console.log(`\n  Connected successfully!`);
          console.log(`  Your JID: ${normalizedJid}`);
          console.log(`  Auth saved to data/wa-auth/\n`);

          // Keep alive briefly to ensure creds are saved, then resolve
          setTimeout(() => {
            sock.end(undefined);
            resolve(normalizedJid);
          }, 3000);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

function testClaude(): boolean {
  console.log("Step 5: Testing Claude CLI...\n");

  try {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const result = execSync(
      'claude -p "Say OK" --max-turns 1 --output-format text',
      {
        cwd: ROOT_DIR,
        timeout: 30_000,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env,
      }
    ).trim();

    const preview = result.length > 80 ? result.slice(0, 80) + "..." : result;
    console.log(`  Claude responded: "${preview}"`);
    console.log("  \u2713 Claude CLI works!\n");
    return true;
  } catch (e: unknown) {
    const err = e as { message?: string; stderr?: string };
    console.log("  \u2717 Claude CLI test failed:");
    console.log(`    ${err.stderr || err.message}`);
    console.log("    Make sure 'claude' is installed and authenticated.\n");
    return false;
  }
}

function startServices(): boolean {
  console.log("Step 6: Starting Mietek...\n");

  try {
    execSync("pm2 start ecosystem.config.cjs", {
      cwd: ROOT_DIR,
      encoding: "utf8",
      stdio: "inherit",
    });
    console.log("");
    return true;
  } catch {
    console.log("  Failed to start PM2 processes.");
    console.log("  Try manually: pm2 start ecosystem.config.cjs\n");
    return false;
  }
}

function printNextSteps(): void {
  console.log("=".repeat(52));
  console.log("");
  console.log("  Mietek is running! Send a WhatsApp message to test it.");
  console.log("");
  console.log("  Useful commands:");
  console.log("     pm2 logs          — view logs");
  console.log("     pm2 status        — check process status");
  console.log("     npm run health    — run health check");
  console.log("");
}

// --- Main ---

async function main() {
  printBanner();

  // Step 1: Prerequisites
  const prereqOk = checkPrerequisites();
  if (!prereqOk) {
    console.log("Please install the missing prerequisites and re-run setup.\n");
    process.exit(1);
  }

  // Step 2: .env setup
  const rl = createRL();
  try {
    await setupEnv(rl);
  } finally {
    rl.close();
  }

  // Step 3: data/ directory
  ensureDataDir();

  // Step 4: WhatsApp pairing
  const jid = await connectWhatsApp();

  // Step 5: Write OWNER_JID to .env
  updateEnvWithJid(jid);
  console.log(`  Updated .env with OWNER_JID=${jid}\n`);

  // Step 6: Test Claude CLI
  testClaude();

  // Step 7: Start PM2 services
  startServices();

  // Done
  printNextSteps();

  process.exit(0);
}

main().catch((e) => {
  console.error("\nSetup failed:", e.message || e);
  process.exit(1);
});
