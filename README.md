# Mietek

> AI assistant in WhatsApp, powered by your Claude Code subscription.
> No API keys. No per-message costs. Just your existing Claude Pro/Max plan.

## How it works

WhatsApp message → Bridge (Baileys) → SQLite queue → Processor (claude -p) → response back to WhatsApp

Three isolated PM2 processes communicate via SQLite:
- **Bridge** — WhatsApp connection via Baileys, message listener & sender
- **Processor** — Invokes Claude Code CLI (`claude -p`), manages context, memory, and commands
- **Heartbeat** — System monitoring, reminders, daily summaries

## Bring AI to Any Chat

> This is Mietek's killer feature.

Most AI chatbots live in their own window. Mietek lives in **your WhatsApp** — and you can summon it into any conversation: a group chat with friends, a 1:1 with your partner, a work thread. Just type:

```
HeyMietek say hello, explain who you are and where you coming from
```

The response goes directly into that chat. Everyone sees it. It feels like you just invited the smartest person in the room.

**Only you can activate it.** Mietek responds exclusively to messages sent from the owner's account (`fromMe`). If someone else in the group types `HeyMietek` — nothing happens. Your friends can't accidentally (or intentionally) trigger it. This is by design: your Claude subscription, your rules.

> Per-chat permissions (allowing specific people to invoke Mietek) are on the roadmap but not yet implemented.

The trigger word is customizable — set `TRIGGER_WORD` in `.env` to whatever you want.

---

## Quick Start

```bash
git clone https://github.com/kalor62/mietek.git
cd mietek
npm install
npm run setup    # Interactive wizard: prerequisites, WhatsApp QR, Claude CLI test
pm2 start ecosystem.config.cjs
```

Send a WhatsApp message to yourself — Mietek will respond!

## Prerequisites

- **Node.js 18+**
- **Claude Code CLI** installed & authenticated (`claude -p` must work)
- **PM2** — `npm i -g pm2`
- **WhatsApp account** — Mietek connects as a linked device

## Architecture

```
┌──────────────┐      ┌──────────┐      ┌──────────────┐
│    Bridge     │─────>│  SQLite  │<─────│  Processor   │
│  (WhatsApp)  │<─────│  (queue) │─────>│  (claude -p) │
└──────────────┘      └──────────┘      └──────────────┘
                           ^
                      ┌────┴─────┐
                      │ Heartbeat│
                      │ (monitor)│
                      └──────────┘
```

- **Bridge** polls DB for completed responses, sends via WhatsApp
- **Processor** polls DB for pending messages, invokes `claude -p`
- **Heartbeat** runs system checks, fires reminders, generates daily summaries

## Commands

| Command | Description |
|---------|-------------|
| `/status` | System status (Docker, PM2, disk, RAM) |
| `/memory` | Show stored facts about you |
| `/forget <key>` | Remove a fact from memory |
| `/remind <text> za <time>` | Set a reminder (e.g., `/remind meeting za 30 min`) |
| `/clear` | Clear current conversation session |
| `/sudo <message>` | Full bash access mode (use with caution) |

## Custom Skills

Extend Mietek with domain-specific knowledge by adding markdown files to `src/skills/`. See `src/skills/example.md` for a template.

Skills can leverage MCP tools configured in `mcp-config.json`.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OWNER_JID` | Yes | — | Your WhatsApp JID (auto-detected during setup) |
| `OWNER_NAME` | No | `User` | Your name (used in assistant prompts) |
| `BOT_NAME` | No | `Mietek` | Bot name (shown in message headers) |
| `TRIGGER_WORD` | No | `HeyMietek` | Word to invoke Mietek from any chat |
| `QUIET_HOUR_START` | No | `23` | Start of quiet hours (alerts batched) |
| `QUIET_HOUR_END` | No | `7` | End of quiet hours |

## Health Check

```bash
npm run health
```

Verifies SQLite DB, Claude CLI, WhatsApp auth, and PM2 processes.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Author

**Karol Mroszczyk** — [kmxsoftware.com](https://kmxsoftware.com) · [𝕏 @mrok86](https://x.com/mrok86)

## License

MIT — see [LICENSE](LICENSE)
