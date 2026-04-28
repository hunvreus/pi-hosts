import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { HostRecord, HostStore } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function metadata(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function host(value: unknown): HostRecord | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.name !== "string" || typeof value.address !== "string") {
    return null;
  }
  const protocol = value.protocol === "ssh" ? "ssh" : null;
  if (!protocol) return null;
  const port = typeof value.port === "number" && Number.isInteger(value.port) ? value.port : undefined;
  return {
    id: value.id,
    name: value.name,
    address: value.address,
    protocol,
    user: typeof value.user === "string" ? value.user : undefined,
    port,
    identityFile: typeof value.identityFile === "string" ? value.identityFile : undefined,
    proxyJump: typeof value.proxyJump === "string" ? value.proxyJump : undefined,
    cwd: typeof value.cwd === "string" ? value.cwd : undefined,
    bastionHostId:
      typeof value.bastionHostId === "string" || value.bastionHostId === null ? value.bastionHostId : undefined,
    aliases: strings(value.aliases),
    tags: strings(value.tags),
    metadata: metadata(value.metadata),
    facts: metadata(value.facts),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
  };
}

export function emptyStore(): HostStore {
  return { version: 1, hosts: [] };
}

export function loadStore(path: string): HostStore {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.hosts)) return emptyStore();
    return { version: 1, hosts: parsed.hosts.map(host).filter((item): item is HostRecord => item !== null) };
  } catch (error) {
    const code = isRecord(error) && typeof error.code === "string" ? error.code : "";
    if (code === "ENOENT") return emptyStore();
    throw error;
  }
}

export function saveStore(path: string, store: HostStore): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}
