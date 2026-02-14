import { execSync } from "child_process";
import { createLogger } from "../lib/logger.js";

const log = createLogger("heartbeat");

export interface CheckResult {
  type: string;
  severity: "info" | "warning" | "critical";
  dedupKey: string;
  message: string;
}

export function checkDocker(): CheckResult[] {
  const results: CheckResult[] = [];

  try {
    const output = execSync(
      "docker ps -a --format '{{.Names}}|{{.Status}}|{{.State}}'",
      { encoding: "utf8", timeout: 10_000 }
    ).trim();

    if (!output) return results;

    for (const line of output.split("\n")) {
      const [name, status, state] = line.split("|");
      if (!name) continue;

      if (state === "exited" || state === "dead") {
        results.push({
          type: "docker",
          severity: "warning",
          dedupKey: `docker-down-${name}`,
          message: `🐳 Kontener ${name} jest ${state}: ${status}`,
        });
      } else if (status.includes("unhealthy")) {
        results.push({
          type: "docker",
          severity: "warning",
          dedupKey: `docker-unhealthy-${name}`,
          message: `🐳 Kontener ${name} jest unhealthy: ${status}`,
        });
      }
    }
  } catch (err) {
    // Docker not available - not an error
    log.warn(`Docker check failed: ${err}`);
  }

  return results;
}

export function checkDisk(): CheckResult[] {
  const results: CheckResult[] = [];

  try {
    const output = execSync("df -h / | tail -1", { encoding: "utf8", timeout: 5000 }).trim();
    const parts = output.split(/\s+/);
    const usagePercent = parseInt(parts[4]);

    if (usagePercent >= 95) {
      results.push({
        type: "disk",
        severity: "critical",
        dedupKey: "disk-critical",
        message: `💾 KRYTYCZNY: Dysk ${usagePercent}% użycia (${parts[2]}/${parts[1]})`,
      });
    } else if (usagePercent >= 90) {
      results.push({
        type: "disk",
        severity: "warning",
        dedupKey: "disk-warning",
        message: `💾 Dysk ${usagePercent}% użycia (${parts[2]}/${parts[1]})`,
      });
    }
  } catch (err) {
    log.warn(`Disk check failed: ${err}`);
  }

  return results;
}

export function checkPM2(): CheckResult[] {
  const results: CheckResult[] = [];

  try {
    const output = execSync("pm2 jlist 2>/dev/null", { encoding: "utf8", timeout: 5000 });
    const processes = JSON.parse(output);

    for (const p of processes) {
      const name = p.name;
      const status = p.pm2_env?.status;
      const restarts = p.pm2_env?.restart_time || 0;

      if (status === "errored" || status === "stopped") {
        results.push({
          type: "pm2",
          severity: "critical",
          dedupKey: `pm2-down-${name}`,
          message: `⚙️ PM2 proces ${name} jest ${status} (restarts: ${restarts})`,
        });
      } else if (restarts > 10) {
        results.push({
          type: "pm2",
          severity: "warning",
          dedupKey: `pm2-restarts-${name}`,
          message: `⚙️ PM2 proces ${name} ma ${restarts} restartów`,
        });
      }
    }
  } catch (err) {
    log.warn(`PM2 check failed: ${err}`);
  }

  return results;
}

export function getSystemSummary(): string {
  const lines: string[] = [];

  // Disk
  try {
    const disk = execSync("df -h / | tail -1", { encoding: "utf8" }).trim();
    const parts = disk.split(/\s+/);
    lines.push(`💾 Dysk: ${parts[4]} (${parts[2]}/${parts[1]})`);
  } catch { /* non-critical */ }

  // RAM
  try {
    const mem = execSync("free -h | grep Mem", { encoding: "utf8" }).trim();
    const parts = mem.split(/\s+/);
    lines.push(`🧠 RAM: ${parts[2]}/${parts[1]}`);
  } catch { /* Linux-only: free -h */ }

  // Docker
  try {
    const docker = execSync(
      "docker ps --format '{{.Names}}: {{.Status}}' 2>/dev/null",
      { encoding: "utf8", timeout: 5000 }
    ).trim();
    if (docker) {
      lines.push(`🐳 Docker:\n${docker}`);
    }
  } catch { /* Docker not available */ }

  // PM2
  try {
    const pm2 = execSync("pm2 jlist 2>/dev/null", { encoding: "utf8", timeout: 5000 });
    const processes = JSON.parse(pm2);
    const pm2Lines = processes.map(
      (p: { name: string; pm2_env?: { status?: string; restart_time?: number } }) => `  ${p.name}: ${p.pm2_env?.status} (↻${p.pm2_env?.restart_time || 0})`
    );
    if (pm2Lines.length > 0) {
      lines.push(`⚙️ PM2:\n${pm2Lines.join("\n")}`);
    }
  } catch { /* PM2 not available */ }

  // Uptime
  try {
    const uptime = execSync("uptime -p", { encoding: "utf8" }).trim();
    lines.push(`⏱️ ${uptime}`);
  } catch { /* Linux-only: uptime -p */ }

  return lines.join("\n");
}
