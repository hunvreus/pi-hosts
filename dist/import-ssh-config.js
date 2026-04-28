import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findHost, hostId, upsertHost } from "./inventory.js";
function stripComment(line) {
    let quoted = false;
    let out = "";
    for (const char of line) {
        if (char === '"')
            quoted = !quoted;
        if (char === "#" && !quoted)
            break;
        out += char;
    }
    return out.trim();
}
function clean(value) {
    return value.replace(/^"|"$/g, "");
}
function isExplicit(alias) {
    return alias.length > 0 && !alias.startsWith("!") && !alias.includes("*") && !alias.includes("?");
}
export function parseSshConfig(text) {
    const hosts = [];
    const defaults = {};
    let current = null;
    let currentDefaults = false;
    for (const raw of text.split(/\r?\n/)) {
        const line = stripComment(raw);
        if (!line)
            continue;
        const match = line.match(/^(\S+)\s+(.+)$/);
        if (!match)
            continue;
        const key = match[1]?.toLowerCase();
        const value = match[2] ?? "";
        if (key === "host") {
            const aliases = value.split(/\s+/).map(clean);
            const explicitAliases = aliases.filter(isExplicit);
            currentDefaults = explicitAliases.length === 0 && aliases.some((alias) => alias.includes("*"));
            current = explicitAliases.length > 0 ? { aliases: explicitAliases } : null;
            if (current)
                hosts.push(current);
            continue;
        }
        const target = currentDefaults ? defaults : current;
        if (!target)
            continue;
        if (key === "hostname")
            target.hostname = clean(value);
        if (key === "user")
            target.user = clean(value);
        if (key === "port") {
            const port = Number.parseInt(value, 10);
            if (Number.isInteger(port))
                target.port = port;
        }
        if (key === "identityfile")
            target.identityFile = clean(value);
        if (key === "proxyjump")
            target.proxyJump = clean(value);
    }
    return hosts.map((host) => ({ ...defaults, ...host }));
}
export function readSshConfig(path = join(homedir(), ".ssh", "config")) {
    return parseSshConfig(readFileSync(path, "utf8"));
}
function inputFromSsh(host) {
    const name = host.aliases[0] ?? "";
    return {
        id: hostId(name),
        name,
        address: host.hostname ?? name,
        protocol: "ssh",
        user: host.user,
        port: host.port,
        identityFile: host.identityFile,
        proxyJump: host.proxyJump,
        aliases: host.aliases.slice(1),
        tags: [],
        metadata: { importedFrom: "ssh-config" },
    };
}
function matches(host, names) {
    if (names.length === 0)
        return true;
    const wanted = new Set(names.map((name) => name.toLowerCase()));
    return host.aliases.some((alias) => wanted.has(alias.toLowerCase()));
}
export function importSshHosts(store, hosts, names, mode) {
    const result = { created: [], updated: [], skipped: [], preview: [] };
    for (const ssh of hosts.filter((host) => matches(host, names))) {
        const input = inputFromSsh(ssh);
        result.preview.push(input);
        if (mode === "preview")
            continue;
        const existing = findHost(store, input.name);
        if (!existing) {
            if (mode === "update_transport" || mode === "aliases") {
                result.skipped.push(input.name);
                continue;
            }
            upsertHost(store, input);
            result.created.push(input.name);
            continue;
        }
        if (mode === "create_only") {
            result.skipped.push(input.name);
            continue;
        }
        if (mode === "aliases") {
            upsertHost(store, { ...existing, aliases: [...existing.aliases, input.name, ...(input.aliases ?? [])] });
            result.updated.push(existing.name);
            continue;
        }
        const merged = {
            ...existing,
            address: input.address,
            user: input.user,
            port: input.port,
            identityFile: input.identityFile,
            proxyJump: input.proxyJump,
            aliases: mode === "all" ? input.aliases : existing.aliases,
            tags: existing.tags,
            metadata: existing.metadata,
        };
        upsertHost(store, merged);
        result.updated.push(existing.name);
    }
    return result;
}
