import { findHost, findHostsByTag, normalizeName } from "./inventory.js";
import type { HostStore, ResolvedHost, TurnState } from "./types.js";

export function inferTargets(prompt: string, store: HostStore): string[] {
  const ids = new Set<string>();
  for (const match of prompt.matchAll(/#([a-zA-Z0-9._-]+)/g)) {
    const host = findHost(store, match[1] ?? "");
    if (host) ids.add(host.id);
  }
  if (ids.size > 0) return [...ids];

  const lowered = prompt.toLowerCase();
  for (const host of store.hosts) {
    const names = [host.name, ...host.aliases, ...host.tags].map((value) => value.toLowerCase());
    if (names.some((name) => hasNameToken(lowered, name))) ids.add(host.id);
  }
  return [...ids];
}

function isNameChar(value: string): boolean {
  return /[a-z0-9._-]/i.test(value);
}

function hasNameToken(prompt: string, name: string): boolean {
  if (!name) return false;
  let index = prompt.indexOf(name);
  while (index >= 0) {
    const before = index > 0 ? prompt[index - 1] : "";
    const after = index + name.length < prompt.length ? prompt[index + name.length] : "";
    if ((!before || !isNameChar(before)) && (!after || !isNameChar(after))) return true;
    index = prompt.indexOf(name, index + 1);
  }
  return false;
}

export function resolveTargets(store: HostStore, requested: string[], state: TurnState): ResolvedHost[] {
  const keys = requested.length > 0 ? requested : state.turnHostIds.length > 0 ? state.turnHostIds : [];
  const activeFallback = keys.length === 0 && state.activeHostId ? [state.activeHostId] : [];
  const out: ResolvedHost[] = [];
  const seen = new Set<string>();
  for (const key of [...keys, ...activeFallback]) {
    const host = findHost(store, key);
    const hosts = host ? [host] : findHostsByTag(store, key);
    for (const item of hosts) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

export function activeHost(store: HostStore, state: TurnState): ResolvedHost | null {
  return state.activeHostId ? findHost(store, state.activeHostId) : null;
}

export function setActiveFromPrompt(prompt: string, store: HostStore, state: TurnState): void {
  const ids = inferTargets(prompt, store);
  state.turnHostIds = ids;
  state.activeHostId = ids[0] ?? null;
}

export function explicitHostName(value: string): string {
  return normalizeName(value);
}
