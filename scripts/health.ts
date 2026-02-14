/**
 * Health check script - verifies all Mietek components are working.
 * Run: npm run health
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "mietek.db");
const WA_AUTH_PATH = path.join(DATA_DIR, "wa-auth");

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function check(name: string, fn: () => string): void {
  try {
    const detail = fn();
    results.push({ name, passed: true, detail });
  } catch (e: unknown) {
    const err = e as { message?: string };
    results.push({ name, passed: false, detail: err.message || "Unknown error" });
  }
}

// Check 1: SQLite DB accessible
check("SQLite database", () => {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Database not found at ${DB_PATH}`);
  }
  // Try to open and query the DB
  const output = execSync(`sqlite3 "${DB_PATH}" "SELECT count(*) FROM sqlite_master;"`, {
    encoding: "utf8",
    timeout: 5000,
  }).trim();
  return `Accessible (${output} tables)`;
});

// Check 2: Claude CLI responds
check("Claude CLI", () => {
  const env = { ...process.env };
  delete env.CLAUDECODE;

  const output = execSync(
    'claude -p "test" --max-turns 1 --output-format text',
    {
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
      env,
    }
  ).trim();
  const preview = output.length > 60 ? output.slice(0, 60) + "..." : output;
  return `Responds: "${preview}"`;
});

// Check 3: WhatsApp auth exists
check("WhatsApp auth", () => {
  if (!fs.existsSync(WA_AUTH_PATH)) {
    throw new Error(`Auth directory not found at ${WA_AUTH_PATH}`);
  }
  const files = fs.readdirSync(WA_AUTH_PATH);
  if (files.length === 0) {
    throw new Error("Auth directory is empty - run setup first");
  }
  return `Found ${files.length} auth files`;
});

// Check 4: PM2 processes running
check("PM2 processes", () => {
  let output: string;
  try {
    output = execSync("pm2 jlist", {
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error("PM2 not running or not installed");
  }

  const processes = JSON.parse(output) as Array<{ name: string; pm2_env?: { status?: string } }>;
  const mietekProcesses = processes.filter((p) => p.name.startsWith("mietek-"));

  if (mietekProcesses.length === 0) {
    throw new Error("No mietek-* processes found in PM2");
  }

  const statuses = mietekProcesses.map(
    (p) => `${p.name}: ${p.pm2_env?.status || "unknown"}`
  );
  return statuses.join(", ");
});

// Print results
console.log("\n=== Mietek Health Check ===\n");

let allPassed = true;

for (const r of results) {
  const icon = r.passed ? "\u2713" : "\u2717";
  const status = r.passed ? "PASS" : "FAIL";
  console.log(`  ${icon} [${status}] ${r.name}`);
  console.log(`           ${r.detail}`);
  if (!r.passed) allPassed = false;
}

console.log("");

if (allPassed) {
  console.log("All checks passed!\n");
  process.exit(0);
} else {
  console.log("Some checks failed. See above for details.\n");
  process.exit(1);
}
