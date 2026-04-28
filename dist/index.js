import { handleHostsCommand } from "./commands/hosts.js";
import { loadConfig } from "./config.js";
import { activeHost, setActiveFromPrompt } from "./resolve.js";
import { inventoryText, factsText } from "./format.js";
import { listHosts } from "./inventory.js";
import { defaultAuditPath, defaultConfigPath, defaultHostsPath } from "./paths.js";
import { loadStore } from "./storage.js";
import { registerTools } from "./tools/register.js";
function flagValue(pi, name, fallback) {
    const value = pi.getFlag(name);
    return typeof value === "string" && value.trim() ? value : fallback;
}
export default function registerPiHosts(pi) {
    pi.registerFlag("hosts-path", {
        type: "string",
        description: `JSON host inventory path (default ${defaultHostsPath})`,
        default: defaultHostsPath,
    });
    pi.registerFlag("hosts-audit-path", {
        type: "string",
        description: `JSONL remote execution audit path (default ${defaultAuditPath})`,
        default: defaultAuditPath,
    });
    pi.registerFlag("hosts-config", {
        type: "string",
        description: `Policy config path (default project .pi/pi-hosts/config.json, then ${defaultConfigPath})`,
        default: "",
    });
    const configPath = flagValue(pi, "hosts-config", "");
    let loadedConfig = loadConfig(process.cwd(), configPath || undefined);
    const runtime = {
        hostsPath: flagValue(pi, "hosts-path", defaultHostsPath),
        auditPath: flagValue(pi, "hosts-audit-path", defaultAuditPath),
        getConfig: () => loadedConfig.config,
        getConfigInfo: () => loadedConfig,
        reloadConfig: () => {
            loadedConfig = loadConfig(process.cwd(), configPath || undefined);
            return loadedConfig;
        },
    };
    const state = { activeHostId: null, turnHostIds: [] };
    pi.on("before_agent_start", async (event) => {
        const store = loadStore(runtime.hostsPath);
        setActiveFromPrompt(event.prompt, store, state);
        const active = activeHost(store, state);
        const activeBlock = active
            ? `Active host: ${active.name} (${active.destination})\nActive facts: ${factsText(active.facts)}`
            : "Active host: none";
        const policy = runtime.getConfig().policy;
        return {
            systemPrompt: `${event.systemPrompt}

pi-hosts:
- Use "host_exec" for remote host commands.
- Use "hosts_import_ssh" when the user asks to import hosts from SSH config.
- Use "host_upsert", "host_lookup", "host_remove", "hosts_list", and "host_facts_refresh" for inventory requests.
- Resolve host references explicitly before remote execution.
- If the user mentions #host, host name, or alias, prefer that target.
- Remote command policy is ${policy.approval}; classifier backend is ${policy.backend}.

Inventory:
${inventoryText(listHosts(store))}

${activeBlock}`,
        };
    });
    registerTools(pi, state, runtime);
    pi.registerCommand("hosts", {
        description: "Manage pi-hosts inventory and SSH imports",
        getArgumentCompletions: (prefix) => {
            const values = ["list", "lookup", "upsert", "remove", "facts refresh", "import ssh", "config show", "config path", "config reload"];
            const filtered = values.filter((value) => value.startsWith(prefix));
            return filtered.length > 0 ? filtered.map((value) => ({ value, label: value })) : null;
        },
        handler: async (args, ctx) => {
            await handleHostsCommand(args, ctx, runtime);
        },
    });
}
