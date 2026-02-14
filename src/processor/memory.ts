import { eq, and } from "drizzle-orm";
import { db } from "../lib/db.js";
import { userMemory } from "../lib/schema.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("processor");

interface MemoryUpdate {
  action: "save" | "delete";
  category?: string;
  key: string;
  value?: string;
}

export function extractAndApplyMemoryUpdates(response: string): string {
  const memoryBlockRegex = /```memory_update\s*\n?([\s\S]*?)```/g;
  let cleanResponse = response;
  let match: RegExpExecArray | null;

  while ((match = memoryBlockRegex.exec(response)) !== null) {
    try {
      const update: MemoryUpdate = JSON.parse(match[1].trim());
      applyMemoryUpdate(update);
    } catch (err) {
      log.warn(`Failed to parse memory update: ${err}`);
    }

    // Remove the memory block from the response
    cleanResponse = cleanResponse.replace(match[0], "").trim();
  }

  return cleanResponse;
}

function applyMemoryUpdate(update: MemoryUpdate): void {
  if (update.action === "save" && update.key && update.value) {
    // Check if key already exists
    const existing = db
      .select()
      .from(userMemory)
      .where(and(eq(userMemory.key, update.key), eq(userMemory.isActive, true)))
      .get();

    if (existing) {
      db.update(userMemory)
        .set({
          value: update.value,
          category: update.category || existing.category,
          updatedAt: new Date(),
        })
        .where(eq(userMemory.id, existing.id))
        .run();
      log.info(`Updated memory: ${update.key} = ${update.value}`);
    } else {
      db.insert(userMemory)
        .values({
          category: update.category || "fact",
          key: update.key,
          value: update.value,
          source: "inferred",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
      log.info(`Saved memory: ${update.key} = ${update.value}`);
    }
  } else if (update.action === "delete" && update.key) {
    db.update(userMemory)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(userMemory.key, update.key), eq(userMemory.isActive, true)))
      .run();
    log.info(`Deleted memory: ${update.key}`);
  }
}
