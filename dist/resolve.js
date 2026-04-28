import { findHost, findHostsByTag, normalizeName } from "./inventory.js";
export function inferTargets(prompt, store) {
    const ids = new Set();
    for (const match of prompt.matchAll(/#([a-zA-Z0-9._-]+)/g)) {
        const host = findHost(store, match[1] ?? "");
        if (host)
            ids.add(host.id);
    }
    if (ids.size > 0)
        return [...ids];
    const lowered = prompt.toLowerCase();
    for (const host of store.hosts) {
        const names = [host.name, ...host.aliases, ...host.tags].map((value) => value.toLowerCase());
        if (names.some((name) => hasNameToken(lowered, name)))
            ids.add(host.id);
    }
    return [...ids];
}
function isNameChar(value) {
    return /[a-z0-9._-]/i.test(value);
}
function hasNameToken(prompt, name) {
    if (!name)
        return false;
    let index = prompt.indexOf(name);
    while (index >= 0) {
        const before = index > 0 ? prompt[index - 1] : "";
        const after = index + name.length < prompt.length ? prompt[index + name.length] : "";
        if ((!before || !isNameChar(before)) && (!after || !isNameChar(after)))
            return true;
        index = prompt.indexOf(name, index + 1);
    }
    return false;
}
export function resolveTargets(store, requested, state) {
    const keys = requested.length > 0 ? requested : state.turnHostIds.length > 0 ? state.turnHostIds : [];
    const activeFallback = keys.length === 0 && state.activeHostId ? [state.activeHostId] : [];
    const out = [];
    const seen = new Set();
    for (const key of [...keys, ...activeFallback]) {
        const host = findHost(store, key);
        const hosts = host ? [host] : findHostsByTag(store, key);
        for (const item of hosts) {
            if (seen.has(item.id))
                continue;
            seen.add(item.id);
            out.push(item);
        }
    }
    return out;
}
export function activeHost(store, state) {
    return state.activeHostId ? findHost(store, state.activeHostId) : null;
}
export function setActiveFromPrompt(prompt, store, state) {
    const ids = inferTargets(prompt, store);
    state.turnHostIds = ids;
    state.activeHostId = ids[0] ?? null;
}
export function explicitHostName(value) {
    return normalizeName(value);
}
