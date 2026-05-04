import { Type } from "@sinclair/typebox";
import { writeAudit } from "../audit.js";
import { factsText, hostDetail, inventoryText } from "../format.js";
import { importSshHosts, readSshConfig } from "../import-ssh-config.js";
import { findHost, listHosts, removeHost, setFacts, upsertHost } from "../inventory.js";
import { assess } from "../policy.js";
import { resolveTargets } from "../resolve.js";
import { loadStore, saveStore } from "../storage.js";
import { closeSession, listSessions, openSession, runSsh, writeSession } from "../transport/ssh.js";
import { refreshFacts } from "../facts.js";
function text(content, details) {
    return { content: [{ type: "text", text: content }], details };
}
function requested(values) {
    return Array.isArray(values) ? values.map(String) : [];
}
function auditReject(config, hosts, command, risk, durationMs) {
    writeAudit(config.auditPath, {
        timestamp: new Date().toISOString(),
        hosts,
        command,
        risk: risk.level,
        decision: risk.decision,
        approval: risk.approval,
        allowed: false,
        confirmed: false,
        rejected: true,
        reasons: risk.reasons,
        durationMs,
        truncated: false,
        timedOut: false,
    });
}
export function registerTools(pi, state, config) {
    pi.registerTool({
        name: "hosts_list",
        label: "Hosts List",
        description: "List all configured hosts in inventory.",
        parameters: Type.Object({}),
        async execute() {
            const hosts = listHosts(loadStore(config.hostsPath));
            return text(inventoryText(hosts), { count: hosts.length, hosts: hosts.map((host) => host.id) });
        },
    });
    pi.registerTool({
        name: "host_lookup",
        label: "Host Lookup",
        description: "Lookup host inventory details by name, alias, id, or #host reference.",
        parameters: Type.Object({ name: Type.String() }),
        async execute(_id, params) {
            const host = findHost(loadStore(config.hostsPath), params.name);
            return host ? text(hostDetail(host), { host }) : text(`Host not found: ${params.name}`, { host: null });
        },
    });
    pi.registerTool({
        name: "host_upsert",
        label: "Host Upsert",
        description: "Create or update one host in inventory.",
        parameters: Type.Object({
            name: Type.String(),
            address: Type.String(),
            user: Type.Optional(Type.String()),
            port: Type.Optional(Type.Number()),
            identityFile: Type.Optional(Type.String()),
            proxyJump: Type.Optional(Type.String()),
            cwd: Type.Optional(Type.String()),
            aliases: Type.Optional(Type.Array(Type.String())),
            tags: Type.Optional(Type.Array(Type.String())),
        }),
        async execute(_id, params) {
            const store = loadStore(config.hostsPath);
            const host = upsertHost(store, {
                name: params.name,
                address: params.address,
                user: params.user,
                port: params.port,
                identityFile: params.identityFile,
                proxyJump: params.proxyJump,
                cwd: params.cwd,
                aliases: params.aliases,
                tags: params.tags,
            });
            saveStore(config.hostsPath, store);
            return text(`Saved host ${host.name}.`, { host });
        },
    });
    pi.registerTool({
        name: "host_remove",
        label: "Host Remove",
        description: "Remove a host from inventory.",
        parameters: Type.Object({ name: Type.String() }),
        async execute(_id, params) {
            const store = loadStore(config.hostsPath);
            const removed = removeHost(store, params.name);
            if (removed)
                saveStore(config.hostsPath, store);
            return text(removed ? `Removed host ${removed.name}.` : `Host not found: ${params.name}`, { removed });
        },
    });
    pi.registerTool({
        name: "hosts_import_ssh",
        label: "Hosts Import SSH",
        description: "Import host transport settings from ~/.ssh/config into hosts.json.",
        parameters: Type.Object({
            names: Type.Optional(Type.Array(Type.String())),
            all: Type.Optional(Type.Boolean()),
            mode: Type.Optional(Type.Union([
                Type.Literal("preview"),
                Type.Literal("create_only"),
                Type.Literal("update_transport"),
                Type.Literal("all"),
                Type.Literal("aliases"),
            ])),
            configPath: Type.Optional(Type.String()),
        }),
        async execute(_id, params) {
            const store = loadStore(config.hostsPath);
            const mode = params.mode ?? "create_only";
            const hosts = readSshConfig(params.configPath);
            const names = params.all ? [] : params.names ?? [];
            if (!params.all && names.length === 0) {
                return text("Provide names or set all=true for SSH import.", { created: [], updated: [], skipped: [], preview: [] });
            }
            const result = importSshHosts(store, hosts, names, mode);
            if (mode !== "preview")
                saveStore(config.hostsPath, store);
            return text(`created=${result.created.length} updated=${result.updated.length} skipped=${result.skipped.length} preview=${result.preview.length}`, result);
        },
    });
    pi.registerTool({
        name: "host_facts_refresh",
        label: "Host Facts Refresh",
        description: "Probe remote host facts over SSH and persist them on host records.",
        parameters: Type.Object({ hosts: Type.Optional(Type.Array(Type.String())) }),
        async execute(_id, params) {
            const store = loadStore(config.hostsPath);
            const targets = resolveTargets(store, requested(params.hosts), state);
            if (targets.length === 0)
                return text("No hosts resolved for facts refresh.");
            const lines = [];
            for (const host of targets) {
                try {
                    const facts = await refreshFacts(host);
                    setFacts(store, host.id, facts);
                    lines.push(`${host.name}: ${factsText(facts)}`);
                }
                catch (error) {
                    lines.push(`${host.name}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            saveStore(config.hostsPath, store);
            return text(lines.join("\n"), { hosts: targets.map((host) => host.id) });
        },
    });
    pi.registerTool({
        name: "host_exec",
        label: "Host Exec",
        description: "Run a shell command over SSH on explicitly resolved host targets with deterministic risk checks.",
        parameters: Type.Object({
            command: Type.String(),
            hosts: Type.Optional(Type.Array(Type.String())),
            timeoutSeconds: Type.Optional(Type.Number()),
            maxBytes: Type.Optional(Type.Number()),
        }),
        async execute(_id, params, _signal, _onUpdate, ctx) {
            const started = Date.now();
            const store = loadStore(config.hostsPath);
            const targets = resolveTargets(store, requested(params.hosts), state);
            if (targets.length === 0)
                return text("No target hosts resolved. Provide hosts or mention a known #host.");
            const risk = assess(params.command, targets.length, config.getConfig().policy);
            const hostIds = targets.map((host) => host.id);
            if (risk.decision === "block") {
                auditReject(config, hostIds, params.command, risk, Date.now() - started);
                return text(`Blocked remote command: ${risk.reasons.join(", ")}`, { risk });
            }
            let confirmed = false;
            if (risk.decision === "confirm") {
                if (!ctx.hasUI) {
                    auditReject(config, hostIds, params.command, risk, Date.now() - started);
                    return text(`Confirmation required: ${risk.reasons.join(", ")}`, { risk });
                }
                confirmed = await ctx.ui.confirm("Confirm remote command", `hosts=${hostIds.join(", ")}\ncommand=${params.command}\nrisk=${risk.level}\napproval=${risk.approval}\nreasons=${risk.reasons.join(", ")}`);
                if (!confirmed) {
                    auditReject(config, hostIds, params.command, risk, Date.now() - started);
                    return text("Remote command rejected by user.", { risk });
                }
            }
            const timeoutMs = Math.max(1, params.timeoutSeconds ?? 60) * 1000;
            const maxBytes = Math.max(1024, params.maxBytes ?? 64_000);
            const blocks = [];
            const results = [];
            for (const host of targets) {
                const result = await runSsh(host, params.command, { timeoutMs, maxBytes });
                results.push(result);
                writeAudit(config.auditPath, {
                    timestamp: new Date().toISOString(),
                    hosts: [host.id],
                    command: params.command,
                    risk: risk.level,
                    decision: risk.decision,
                    approval: risk.approval,
                    allowed: true,
                    confirmed,
                    rejected: false,
                    reasons: risk.reasons,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                    truncated: result.truncated,
                    timedOut: result.timedOut,
                });
                blocks.push([`## ${host.name}`, `$ ${params.command}`, `exit=${result.exitCode}`, result.stdout.trim(), result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : ""]
                    .filter(Boolean)
                    .join("\n"));
            }
            return text(blocks.join("\n\n"), { risk, results });
        },
    });
    pi.registerTool({
        name: "remote_session_open",
        label: "Remote Session Open",
        description: "Open an interactive SSH shell session for a resolved host.",
        parameters: Type.Object({
            host: Type.String(),
            startup: Type.Optional(Type.String()),
            rows: Type.Optional(Type.Number()),
            cols: Type.Optional(Type.Number()),
        }),
        async execute(_id, params) {
            const host = findHost(loadStore(config.hostsPath), params.host);
            if (!host)
                return text(`Host not found: ${params.host}`);
            const session = openSession(host, { startup: params.startup, rows: params.rows, cols: params.cols });
            return text(`Opened session ${session.id} for ${host.name}.`, { sessionId: session.id, host: host.id });
        },
    });
    pi.registerTool({
        name: "remote_session_write",
        label: "Remote Session Write",
        description: "Write bytes/text to an interactive SSH session and return bounded output.",
        parameters: Type.Object({
            sessionId: Type.String(),
            input: Type.String(),
            waitMs: Type.Optional(Type.Number()),
            maxBytes: Type.Optional(Type.Number()),
        }),
        async execute(_id, params) {
            const output = await writeSession(params.sessionId, params.input, params.waitMs ?? 500, params.maxBytes ?? 64_000);
            return text(output || "(no output)", { sessionId: params.sessionId });
        },
    });
    pi.registerTool({
        name: "remote_session_close",
        label: "Remote Session Close",
        description: "Close an interactive SSH session.",
        parameters: Type.Object({ sessionId: Type.String() }),
        async execute(_id, params) {
            const closed = closeSession(params.sessionId);
            return text(closed ? `Closed session ${params.sessionId}.` : `Session not found: ${params.sessionId}`, { closed });
        },
    });
    pi.registerTool({
        name: "remote_session_list",
        label: "Remote Session List",
        description: "List open interactive SSH sessions.",
        parameters: Type.Object({}),
        async execute() {
            const sessions = listSessions().map((session) => ({
                id: session.id,
                hostId: session.hostId,
                startedAt: session.startedAt,
            }));
            return text(sessions.length === 0 ? "No open sessions." : sessions.map((session) => `${session.id} ${session.hostId}`).join("\n"), {
                sessions,
            });
        },
    });
}
