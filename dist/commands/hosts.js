import { factsText, hostDetail, inventoryText } from "../format.js";
import { importSshHosts, readSshConfig } from "../import-ssh-config.js";
import { findHost, listHosts, removeHost, setFacts, upsertHost } from "../inventory.js";
import { refreshFacts } from "../facts.js";
import { loadStore, saveStore } from "../storage.js";
function splitArgs(input) {
    const out = [];
    let current = "";
    let quote = null;
    for (let i = 0; i < input.length; i += 1) {
        const char = input[i] ?? "";
        if ((char === '"' || char === "'") && !quote) {
            quote = char;
            continue;
        }
        if (char === quote) {
            quote = null;
            continue;
        }
        if (/\s/.test(char) && !quote) {
            if (current)
                out.push(current);
            current = "";
            continue;
        }
        current += char;
    }
    if (current)
        out.push(current);
    return out;
}
function option(args, name) {
    const index = args.indexOf(name);
    if (index < 0)
        return undefined;
    return args[index + 1];
}
function has(args, name) {
    return args.includes(name);
}
function mode(args) {
    const raw = option(args, "--mode");
    if (raw === "preview" || raw === "create_only" || raw === "update_transport" || raw === "all" || raw === "aliases") {
        return raw;
    }
    if (has(args, "--preview"))
        return "preview";
    if (has(args, "--update-transport"))
        return "update_transport";
    if (has(args, "--aliases"))
        return "aliases";
    return "create_only";
}
export async function handleHostsCommand(raw, ctx, config) {
    const args = splitArgs(raw);
    const [group, action, name] = args;
    if (group === "config") {
        if (action === "show") {
            ctx.ui.notify(JSON.stringify(config.getConfigInfo().config, null, 2), "info");
            return;
        }
        if (action === "path") {
            const loaded = config.getConfigInfo();
            ctx.ui.notify(`active=${loaded.path ?? "(defaults only)"}\nsearched=${loaded.searched.join(", ")}`, "info");
            return;
        }
        if (action === "reload") {
            const loaded = config.reloadConfig();
            ctx.ui.notify(`reloaded=${loaded.path ?? "(defaults only)"}\napproval=${loaded.config.policy.approval}\nbackend=${loaded.config.policy.backend}`, "info");
            return;
        }
        ctx.ui.notify("Usage: /hosts config show | path | reload", "warning");
        return;
    }
    const store = loadStore(config.hostsPath);
    if (!group || group === "list") {
        ctx.ui.notify(inventoryText(listHosts(store)), "info");
        return;
    }
    if (group === "lookup" && action) {
        const host = findHost(store, action);
        ctx.ui.notify(host ? hostDetail(host) : `Host not found: ${action}`, host ? "info" : "warning");
        return;
    }
    if (group === "upsert" && action) {
        const address = option(args, "--address") ?? option(args, "--host");
        if (!address) {
            ctx.ui.notify("Usage: /hosts upsert <name> --address <host> [--user <user>] [--port <port>]", "error");
            return;
        }
        const portValue = option(args, "--port");
        const port = portValue ? Number.parseInt(portValue, 10) : undefined;
        const host = upsertHost(store, {
            name: action,
            address,
            user: option(args, "--user"),
            port,
            cwd: option(args, "--cwd"),
            aliases: option(args, "--aliases")?.split(","),
            tags: option(args, "--tags")?.split(","),
            identityFile: option(args, "--identity-file"),
            proxyJump: option(args, "--proxy-jump"),
        });
        saveStore(config.hostsPath, store);
        ctx.ui.notify(`Saved host ${host.name}.`, "info");
        return;
    }
    if (group === "remove" && action) {
        const removed = removeHost(store, action);
        if (removed)
            saveStore(config.hostsPath, store);
        ctx.ui.notify(removed ? `Removed host ${removed.name}.` : `Host not found: ${action}`, removed ? "info" : "warning");
        return;
    }
    if (group === "facts" && action === "refresh") {
        const host = name ? findHost(store, name) : null;
        if (!host) {
            ctx.ui.notify(name ? `Host not found: ${name}` : "Usage: /hosts facts refresh <name>", "error");
            return;
        }
        const facts = await refreshFacts(host);
        setFacts(store, host.id, facts);
        saveStore(config.hostsPath, store);
        ctx.ui.notify(`${host.name}: ${factsText(facts)}`, "info");
        return;
    }
    if (group === "import" && action === "ssh") {
        const all = has(args, "--all");
        const names = all ? [] : args.slice(2).filter((item) => !item.startsWith("--") && item !== option(args, "--mode"));
        if (!all && names.length === 0) {
            ctx.ui.notify("Usage: /hosts import ssh <alias> or /hosts import ssh --all", "error");
            return;
        }
        const result = importSshHosts(store, readSshConfig(), names, mode(args));
        if (mode(args) !== "preview")
            saveStore(config.hostsPath, store);
        ctx.ui.notify(`created=${result.created.length} updated=${result.updated.length} skipped=${result.skipped.length} preview=${result.preview.length}`, "info");
        return;
    }
    ctx.ui.notify("Usage: /hosts list | lookup | upsert | remove | facts refresh | import ssh | config", "warning");
}
