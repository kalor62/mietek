// PM2 process configuration for Mietek
// Three isolated processes communicate via SQLite — no direct IPC.
// Start all: pm2 start ecosystem.config.cjs
// Logs:      pm2 logs mietek-bridge | mietek-processor | mietek-heartbeat

module.exports = {
  apps: [
    {
      // Bridge: WhatsApp connection via Baileys.
      // Listens for incoming messages → inserts into SQLite queue.
      // Polls for completed responses → sends back via WhatsApp.
      name: 'mietek-bridge',
      script: 'npx',
      args: 'tsx src/bridge/index.ts',
      cwd: __dirname,
      restart_delay: 5000,   // 5s delay between restarts (WhatsApp needs reconnect cooldown)
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      // Processor: Polls SQLite for pending messages → invokes `claude -p` → writes response back.
      // Each message gets a fresh claude invocation with context (memory, conversation history).
      // Never touches WhatsApp directly — all communication goes through the DB queue.
      name: 'mietek-processor',
      script: 'npx',
      args: 'tsx src/processor/index.ts',
      cwd: __dirname,
      restart_delay: 3000,   // 3s delay — shorter since no external connections to manage
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      // Heartbeat: Background tasks — system monitoring, scheduled reminders, daily summaries.
      // Runs periodic checks and inserts alerts/reminders into the message queue when needed.
      name: 'mietek-heartbeat',
      script: 'npx',
      args: 'tsx src/heartbeat/index.ts',
      cwd: __dirname,
      restart_delay: 5000,
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
