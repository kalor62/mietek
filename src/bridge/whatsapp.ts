import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import { config } from "../lib/config.js";
import { db } from "../lib/db.js";
import { messageQueue } from "../lib/schema.js";
import { createLogger } from "../lib/logger.js";
import { silentLogger } from "../lib/baileys-logger.js";

const log = createLogger("bridge");

// Owner's LID (Linked ID) - populated after connection
let ownerLid: string | null = null;

export function getOwnerLid(): string | null {
  return ownerLid;
}

let sock: WASocket | null = null;
let connected = false;

export function getSocket(): WASocket | null {
  return connected ? sock : null;
}

export async function connectWhatsApp(): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState(config.waAuthPath);
  const { version } = await fetchLatestBaileysVersion();

  log.info(`Using WA version: ${version.join(".")}`);

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
    },
    version,
    logger: silentLogger,
    defaultQueryTimeoutMs: 60_000,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // Wait for connection to be open before returning
  await new Promise<void>((resolve) => {
    sock!.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        log.info("QR code generated - scan with WhatsApp:");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "close") {
        connected = false;
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = reason !== DisconnectReason.loggedOut;

        log.warn(`Connection closed: ${reason}. Reconnect: ${shouldReconnect}`);

        if (shouldReconnect) {
          setTimeout(() => connectWhatsApp().catch(err => {
            log.error(`Reconnection failed: ${err}`);
            process.exit(1);
          }), 5000);
        } else {
          log.error("Logged out - delete data/wa-auth and re-scan QR");
          process.exit(1);
        }
      }

      if (connection === "open") {
        connected = true;
        // Store owner's LID for JID matching (WhatsApp now uses LID format sometimes)
        if (sock!.user?.lid) {
          ownerLid = sock!.user.lid.replace(/:\d+@/, "@");
          log.info(`Owner LID: ${ownerLid}`);
        }
        log.action("WhatsApp connected!");
        resolve();
      }
    });
  });

  // Listen for incoming messages
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // Only process new incoming messages, not our own sent messages (type=append)
    if (type !== "notify") return;

    for (const msg of messages) {
      log.info(`MSG: fromMe=${msg.key?.fromMe}, remoteJid=${msg.key?.remoteJid}, text=${(msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").slice(0, 50)}`);
      await handleMessage(msg);
    }
  });

  return sock;
}

async function handleMessage(msg: proto.IWebMessageInfo): Promise<void> {
  if (!msg.key) return;

  // Extract sender JID
  const senderJid = msg.key.remoteJid;
  if (!senderJid) return;

  // Extract text from message (needed early for HeyMietek check)
  const rawText =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    "";

  if (!rawText.trim()) return;

  // HeyMietek trigger: owner can invoke from any chat (1:1 or group)
  const triggerPattern = new RegExp(`^${config.triggerWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i');
  const heyMietekMatch = rawText.match(triggerPattern);
  const isHeyMietek = heyMietekMatch && msg.key.fromMe === true;

  if (!isHeyMietek) {
    // Standard filters: ignore groups, non-owner
    if (senderJid.endsWith("@g.us")) return;

    if (config.ownerJid) {
      const ownerNorm = config.ownerJid.replace(/:\d+@/, "@");
      const senderNorm = senderJid.replace(/:\d+@/, "@");
      const isOwner =
        senderNorm === ownerNorm ||
        (ownerLid !== null && senderNorm === ownerLid);
      if (!isOwner) {
        log.warn(`Ignored message from non-owner: ${senderJid}`);
        return;
      }
    }
  }

  // Strip HeyMietek prefix from text
  const text = isHeyMietek
    ? rawText.slice(heyMietekMatch![0].length).trim()
    : rawText.trim();

  if (!text) return;

  const waMessageId = msg.key.id || `unknown-${Date.now()}`;

  log.info(`${isHeyMietek ? "[HeyMietek] " : ""}Message from ${senderJid}: ${text.slice(0, 100)}`);

  // Insert into message queue
  try {
    db.insert(messageQueue)
      .values({
        waMessageId,
        senderJid,
        text,
        status: "pending",
        createdAt: new Date(),
      })
      .run();

    log.info(`Queued message ${waMessageId}`);
  } catch (err) {
    log.error(`Failed to queue message: ${err}`);
  }
}
