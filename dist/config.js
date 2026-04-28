import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { defaultConfigPath } from "./paths.js";
const defaults = {
    policy: {
        backend: "local",
        approval: "balanced",
        sensitive: [
            ".env",
            ".env.local",
            ".env.production",
            "~/.ssh",
            "~/.aws",
            "~/.gnupg",
            "~/.kube/config",
            "/etc/shadow",
            "/etc/sudoers",
        ],
        commands: {
            safe: [
                "awk",
                "cat",
                "date",
                "df",
                "du",
                "echo",
                "free",
                "grep",
                "head",
                "hostname",
                "hostnamectl",
                "journalctl",
                "ls",
                "lsof",
                "pgrep",
                "printf",
                "ps",
                "pwd",
                "sed",
                "set",
                "sort",
                "ss",
                "stat",
                "tail",
                "test",
                "top",
                "true",
                "uname",
                "uptime",
                "wc",
                "[",
            ],
            confirm: [
                "apk",
                "apt",
                "apt-get",
                "brew",
                "chmod",
                "chown",
                "cp",
                "dnf",
                "docker",
                "helm",
                "kubectl",
                "mv",
                "podman",
                "rm",
                "service",
                "sudo",
                "systemctl",
                "tee",
                "truncate",
                "yum",
                "zypper",
            ],
            block: ["mkfs", "poweroff", "reboot", "shutdown", "halt", "shred"],
        },
    },
};
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function strings(value, fallback) {
    if (!Array.isArray(value))
        return fallback;
    return value.filter((item) => typeof item === "string");
}
function approval(value, fallback) {
    return value === "strict" || value === "balanced" || value === "paranoid" || value === "manual" || value === "off"
        ? value
        : fallback;
}
function backend(value, fallback) {
    return value === "local" ? value : fallback;
}
function merge(base, raw) {
    if (!isRecord(raw))
        return base;
    const rawPolicy = isRecord(raw.policy) ? raw.policy : {};
    const rawCommands = isRecord(rawPolicy.commands) ? rawPolicy.commands : {};
    return {
        policy: {
            backend: backend(rawPolicy.backend, base.policy.backend),
            approval: approval(rawPolicy.approval, base.policy.approval),
            sensitive: strings(rawPolicy.sensitive, base.policy.sensitive),
            commands: {
                safe: strings(rawCommands.safe, base.policy.commands.safe),
                confirm: strings(rawCommands.confirm, base.policy.commands.confirm),
                block: strings(rawCommands.block, base.policy.commands.block),
            },
        },
    };
}
export function expandPath(path) {
    if (path === "~")
        return homedir();
    if (path.startsWith("~/"))
        return join(homedir(), path.slice(2));
    return isAbsolute(path) ? path : join(process.cwd(), path);
}
export function projectConfigPath(cwd) {
    return join(cwd, ".pi", "pi-hosts", "config.json");
}
export function loadConfig(cwd, overridePath) {
    const searched = overridePath ? [expandPath(overridePath)] : [projectConfigPath(cwd), defaultConfigPath];
    let config = defaults;
    let path = null;
    for (const candidate of searched) {
        if (!existsSync(candidate))
            continue;
        const parsed = JSON.parse(readFileSync(candidate, "utf8"));
        config = merge(config, parsed);
        path = candidate;
        if (overridePath)
            break;
    }
    return { config, path, searched };
}
export function defaultConfig() {
    return JSON.parse(JSON.stringify(defaults));
}
