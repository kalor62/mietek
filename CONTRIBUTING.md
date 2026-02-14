# Contributing to Mietek

## Development Setup

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/kalor62/mietek.git
   cd mietek
   npm install
   ```

2. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

3. Run setup to connect WhatsApp:
   ```bash
   npm run setup
   ```

4. Start in development (run each in a separate terminal):
   ```bash
   npm run bridge
   npm run processor
   npm run heartbeat
   ```

## Project Structure

```
src/
├── bridge/       # WhatsApp connection, message listener/sender
├── processor/    # Claude CLI invocation, context, memory, commands
├── heartbeat/    # System monitoring, reminders, daily summaries
├── lib/          # Shared: DB, schema, config, logger
└── skills/       # Custom skill definitions (markdown)
scripts/
├── setup.ts      # Interactive setup wizard
├── health.ts     # Health check script
└── test-claude.ts # Claude CLI test
```

## Code Style

- TypeScript with strict mode
- No build step — runs with `tsx`
- Prefer simple, readable code over abstractions
- Error handling: log errors, don't silently swallow them

## Database

SQLite with Drizzle ORM. Schema is in `src/lib/schema.ts`. Tables are auto-created on startup in `src/lib/db.ts`.

To update the schema:
1. Modify `src/lib/schema.ts`
2. Update the `CREATE TABLE` statements in `src/lib/db.ts`
3. Run `npm run db:generate` for Drizzle migrations

## Pull Requests

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Ensure TypeScript compiles: `npx tsc --noEmit`
5. Test with `npm run test-claude` and `npm run health`
6. Submit a PR with a clear description
