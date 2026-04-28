import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function writeAudit(path, entry) {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
}
