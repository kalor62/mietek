# Mietek - Personal AI Assistant via WhatsApp

## Project Structure
- `src/bridge/` - WhatsApp connection (Baileys), message listener, sender
- `src/processor/` - Message queue processor, Claude -p invocation, context building
- `src/heartbeat/` - System monitoring, reminders, daily summary
- `src/lib/` - Shared: DB, schema, config, logger

## Tech Stack
- Runtime: Node.js + tsx (no build step)
- WhatsApp: @whiskeysockets/baileys (raw WebSocket, no Chromium)
- DB: SQLite via better-sqlite3 + Drizzle ORM (WAL mode)
- AI: claude -p (headless CLI mode)
- Process management: PM2

## Key Patterns
- 3 separate PM2 processes (bridge, processor, heartbeat) for isolation
- Bridge polls DB for completed messages to send (never blocks on Claude)
- Processor polls DB for pending messages to process via claude -p
- All claude -p calls use execSync with configurable timeout
- Owner-only filter: all messages from non-owner JID are ignored

## WhatsApp Messaging Rules

### JID Formats
- Standard JID: `48XXXXXXXXX@s.whatsapp.net` (phone-based, used for sending)
- LID (Linked ID): `XXXXXXXXXXXXXXX@lid` (device-based, used by newer WhatsApp)
- JIDs may contain device suffix: `48XXXXXXXXX:28@s.whatsapp.net` — always normalize with `.replace(/:\d+@/, "@")` before comparing
- Owner's LID is detected on connection from `sock.user.lid` and stored in `ownerLid`

### Receiving Messages (bridge/whatsapp.ts)
- Only `type === "notify"` messages are processed (filters out bot's own sent messages which arrive as `type=append`)
- Group messages (`@g.us`) are ignored
- Owner check compares `remoteJid` against both `OWNER_JID` (from .env) and the owner's LID
- Messages from non-owner JIDs are logged and ignored

### Sending Messages (bridge/sender.ts)
- Always send to `@s.whatsapp.net` JID — LID addresses don't accept outgoing messages
- If `senderJid` is LID format, fall back to `ownerJid` for the reply target
- Long messages are chunked at 4000 chars (split at newline > space > forced)
- 500ms delay between chunks
- Outbound messages to third parties use `outbound_messages` table with approval flow

### Message Flow
1. Bridge receives WA message -> inserts into `message_queue` with status `pending`
2. Processor polls for `pending` -> sets `processing` -> invokes `claude -p` -> sets `completed` with response
3. Bridge polls for `completed` + `sentAt IS NULL` -> sends via WhatsApp -> sets `sentAt`
4. Never call WhatsApp send directly from processor — always go through the DB queue

### Debugging
- `pm2 logs mietek-bridge` — WA connection, incoming/outgoing messages
- `pm2 logs mietek-processor` — Claude invocations, responses
- DB: `sqlite3 data/mietek.db "SELECT id, status, substr(text,1,60) FROM message_queue ORDER BY id DESC LIMIT 10;"`

## Trigger Word - Invoke from Any Chat
- Owner can invoke Mietek from any chat (1:1 or group) by prefixing message with the trigger word (default: `HeyMietek`, configurable via `TRIGGER_WORD` env var)
- Only `fromMe=true` messages trigger it — other people in the chat cannot activate Mietek
- The trigger prefix is stripped before processing
- Runs as **one-shot** (fresh claude session) to prevent context bleed from owner's private session
- No memory access, no memory_update/send_message instructions (privacy in external chats)
- Response is sent back to the same chat where the trigger was written
- Commands (`/status`, `/sudo`, etc.) are NOT available in trigger mode
- **Direct communication rule**: The other person is RIGHT THERE on the chat. Never ask for phone numbers, never use send_message, never suggest other channels. Just write your response — they will see it. Address them directly.

## Custom Skills
You can extend Mietek with custom skills — markdown files in `src/skills/` that provide domain-specific knowledge and instructions.

See `src/skills/example.md` for a template showing how to create your own skill.

To add a new skill:
1. Create a `.md` file in `src/skills/`
2. Document when the skill activates and what instructions to follow
3. Reference it here under this section
4. If the skill needs external tools, configure them in `mcp-config.json`

## Commands
- `/status` - System status (Docker, PM2, disk)
- `/remind <text> za <czas>` - Set reminder
- `/memory` - Show stored facts
- `/forget <key>` - Remove from memory
- `/clear` - Clear current session
- `/sudo <msg>` - Full bash access mode
