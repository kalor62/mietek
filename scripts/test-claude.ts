/**
 * Test claude -p invocation.
 * Run: npm run test-claude
 */

import { execSync } from "child_process";

console.log("=== Testing claude -p ===\n");

const prompt = "Odpowiedz jednym zdaniem po polsku: Kim jest Mietek?";

console.log(`Prompt: ${prompt}`);
console.log("Invoking claude -p...\n");

try {
  const env = { ...process.env };
  delete env.CLAUDECODE;

  const result = execSync(
    `claude -p ${JSON.stringify(prompt)} --max-turns 3 --output-format text`,
    {
      cwd: process.cwd(),
      timeout: 60_000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "inherit"],
      env,
    }
  );

  console.log("Response:", result.trim());
  console.log("\n✅ claude -p works!");
} catch (e: unknown) {
  const err = e as { message?: string; stderr?: string };
  console.error("❌ claude -p failed:");
  console.error(err.stderr || err.message);
  process.exit(1);
}
