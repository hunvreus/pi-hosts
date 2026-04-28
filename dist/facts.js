import { runSsh } from "./transport/ssh.js";
function parseFacts(text) {
    const facts = {};
    for (const line of text.split(/\r?\n/)) {
        const [key, ...rest] = line.trim().split("=");
        const value = rest.join("=").trim();
        if (!key || !value)
            continue;
        if (key === "hostname")
            facts.hostname = value;
        if (key === "os")
            facts.os = value;
        if (key === "arch")
            facts.arch = value;
        if (key === "kernel")
            facts.kernel = value;
        if (key === "distro")
            facts.distro = value;
        if (key === "pkgManager")
            facts.pkgManager = value;
        if (key === "serviceManager")
            facts.serviceManager = value;
        if (key === "containerRuntime")
            facts.containerRuntime = value;
        if (key === "hasSudo")
            facts.hasSudo = value === "true";
    }
    return facts;
}
export async function refreshFacts(host) {
    const command = [
        "set +e",
        "echo hostname=$(hostname 2>/dev/null || true)",
        "echo os=$(uname -s 2>/dev/null || true)",
        "echo arch=$(uname -m 2>/dev/null || true)",
        "echo kernel=$(uname -r 2>/dev/null || true)",
        "if [ -f /etc/os-release ]; then . /etc/os-release; echo distro=${ID:-$NAME}; fi",
        "if command -v apt-get >/dev/null 2>&1; then echo pkgManager=apt; elif command -v yum >/dev/null 2>&1; then echo pkgManager=yum; elif command -v dnf >/dev/null 2>&1; then echo pkgManager=dnf; elif command -v apk >/dev/null 2>&1; then echo pkgManager=apk; elif command -v zypper >/dev/null 2>&1; then echo pkgManager=zypper; fi",
        "if command -v systemctl >/dev/null 2>&1; then echo serviceManager=systemd; elif command -v service >/dev/null 2>&1; then echo serviceManager=service; fi",
        "if command -v docker >/dev/null 2>&1; then echo containerRuntime=docker; elif command -v podman >/dev/null 2>&1; then echo containerRuntime=podman; elif command -v nerdctl >/dev/null 2>&1; then echo containerRuntime=nerdctl; fi",
        "if sudo -n true >/dev/null 2>&1; then echo hasSudo=true; else echo hasSudo=false; fi",
    ].join("; ");
    const result = await runSsh(host, command, { timeoutMs: 20_000, maxBytes: 32_000 });
    if (result.exitCode !== 0 && !result.stdout.trim()) {
        throw new Error(result.stderr.trim() || `fact probe failed with exit ${result.exitCode}`);
    }
    return parseFacts(result.stdout);
}
