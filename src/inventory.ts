import type { HostFacts, HostRecord, HostStore, ResolvedHost } from "./types.js";

export type HostInput = {
  id?: string;
  name: string;
  address: string;
  protocol?: "ssh";
  user?: string;
  port?: number;
  identityFile?: string;
  proxyJump?: string;
  cwd?: string;
  bastionHostId?: string | null;
  aliases?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export function hostId(name: string): string {
  const id = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!id) throw new Error("host name must contain at least one identifier character");
  return id;
}

export function normalizeName(value: string): string {
  return value.replace(/^#/, "").trim().toLowerCase();
}

function unique(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function resolveDestination(host: HostRecord): string {
  return host.user ? `${host.user}@${host.address}` : host.address;
}

export function resolved(host: HostRecord): ResolvedHost {
  return { ...host, destination: resolveDestination(host), cwd: host.cwd ?? "." };
}

export function listHosts(store: HostStore): ResolvedHost[] {
  return [...store.hosts].sort((a, b) => a.name.localeCompare(b.name)).map(resolved);
}

export function findHost(store: HostStore, raw: string): ResolvedHost | null {
  const key = normalizeName(raw);
  if (!key) return null;
  for (const host of store.hosts) {
    if (host.name.toLowerCase() === key) return resolved(host);
  }
  for (const host of store.hosts) {
    if (host.aliases.some((alias) => alias.toLowerCase() === key)) return resolved(host);
  }
  for (const host of store.hosts) {
    if (host.id.toLowerCase() === key) return resolved(host);
  }
  return null;
}

export function findHostsByTag(store: HostStore, raw: string): ResolvedHost[] {
  const key = normalizeName(raw);
  if (!key) return [];
  return store.hosts.filter((host) => host.tags.some((tag) => tag.toLowerCase() === key)).map(resolved);
}

export function upsertHost(store: HostStore, input: HostInput): HostRecord {
  const name = input.name.trim();
  const address = input.address.trim();
  if (!name) throw new Error("name is required");
  if (!address) throw new Error("address is required");
  if (input.port !== undefined && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) {
    throw new Error("port must be an integer from 1 to 65535");
  }
  const now = new Date().toISOString();
  const index = store.hosts.findIndex((item) => item.id === (input.id ?? hostId(name)) || item.name === name);
  const current = index >= 0 ? store.hosts[index] : undefined;
  const next: HostRecord = {
    id: input.id ?? current?.id ?? hostId(name),
    name,
    address,
    protocol: "ssh",
    user: input.user,
    port: input.port,
    identityFile: input.identityFile,
    proxyJump: input.proxyJump,
    cwd: input.cwd,
    bastionHostId: input.bastionHostId,
    aliases: unique(input.aliases),
    tags: unique(input.tags),
    metadata: input.metadata ?? current?.metadata ?? {},
    facts: current?.facts ?? {},
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
  if (index >= 0) {
    store.hosts[index] = next;
  } else {
    store.hosts.push(next);
  }
  return next;
}

export function removeHost(store: HostStore, raw: string): HostRecord | null {
  const host = findHost(store, raw);
  if (!host) return null;
  const index = store.hosts.findIndex((item) => item.id === host.id);
  if (index < 0) return null;
  const [removed] = store.hosts.splice(index, 1);
  return removed ?? null;
}

export function setFacts(store: HostStore, raw: string, facts: HostFacts): HostRecord | null {
  const host = findHost(store, raw);
  if (!host) return null;
  const index = store.hosts.findIndex((item) => item.id === host.id);
  if (index < 0) return null;
  store.hosts[index] = { ...store.hosts[index], facts, updatedAt: new Date().toISOString() };
  return store.hosts[index];
}

export function formatHost(host: ResolvedHost): string {
  const aliases = host.aliases.length > 0 ? ` aliases=${host.aliases.join(",")}` : "";
  const tags = host.tags.length > 0 ? ` tags=${host.tags.join(",")}` : "";
  return `${host.name} (${host.destination})${aliases}${tags}`;
}
