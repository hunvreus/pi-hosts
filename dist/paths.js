import { homedir } from "node:os";
import { join } from "node:path";
export const defaultBaseDir = join(homedir(), ".pi", "agent", "extensions", "pi-hosts");
export const defaultHostsPath = join(defaultBaseDir, "hosts.json");
export const defaultAuditPath = join(defaultBaseDir, "audit.jsonl");
export const defaultConfigPath = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "pi-hosts", "config.json");
export const projectConfigPath = join(process.cwd(), ".pi", "pi-hosts", "config.json");
