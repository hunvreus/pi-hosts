import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AuditEntry } from "./types.js";

export function writeAudit(path: string, entry: AuditEntry): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
}
