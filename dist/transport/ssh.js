import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { truncate } from "../format.js";
const sessions = new Map();
function appendBounded(capture, chunk, maxBytes) {
    if (capture.bytes >= maxBytes) {
        capture.truncated = true;
        return;
    }
    const remaining = maxBytes - capture.bytes;
    if (chunk.byteLength > remaining) {
        capture.chunks.push(chunk.subarray(0, remaining));
        capture.bytes += remaining;
        capture.truncated = true;
        return;
    }
    capture.chunks.push(chunk);
    capture.bytes += chunk.byteLength;
}
function controlPath(host) {
    const dir = "/tmp/pi-hosts";
    mkdirSync(dir, { recursive: true });
    const key = `${host.id}|${host.destination}|${host.port ?? 22}|${host.identityFile ?? ""}|${host.proxyJump ?? ""}`;
    const hash = createHash("sha256").update(key).digest("hex").slice(0, 16);
    return join(dir, `${hash}.sock`);
}
export function sshControlPathForTest(host) {
    return controlPath(host);
}
function baseArgs(host) {
    const args = [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-o",
        "ControlMaster=auto",
        "-o",
        "ControlPersist=10m",
        "-o",
        `ControlPath=${controlPath(host)}`,
    ];
    if (host.port)
        args.push("-p", String(host.port));
    if (host.identityFile)
        args.push("-i", host.identityFile);
    if (host.proxyJump)
        args.push("-J", host.proxyJump);
    args.push(host.destination);
    return args;
}
function shellQuote(value) {
    return `'${value.replace(/'/g, "'\\''")}'`;
}
function remoteCommand(host, command) {
    return `cd ${shellQuote(host.cwd)} && ${command}`;
}
export function runSsh(host, command, options) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const child = spawn("ssh", [...baseArgs(host), remoteCommand(host, command)], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        const stdout = { chunks: [], bytes: 0, truncated: false };
        const stderr = { chunks: [], bytes: 0, truncated: false };
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
        }, options.timeoutMs);
        child.stdout.on("data", (chunk) => appendBounded(stdout, Buffer.from(chunk), options.maxBytes));
        child.stderr.on("data", (chunk) => appendBounded(stderr, Buffer.from(chunk), options.maxBytes));
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            const out = Buffer.concat(stdout.chunks).toString("utf8");
            const err = Buffer.concat(stderr.chunks).toString("utf8");
            resolve({
                host: host.name,
                exitCode: code ?? (timedOut ? 124 : 1),
                stdout: stdout.truncated ? `${out}\n...truncated...` : out,
                stderr: stderr.truncated ? `${err}\n...truncated...` : err,
                durationMs: Date.now() - start,
                timedOut,
                truncated: stdout.truncated || stderr.truncated,
            });
        });
    });
}
export function openSession(host, options = {}) {
    const id = randomUUID();
    const env = options.cols || options.rows ? `stty cols ${options.cols ?? 120} rows ${options.rows ?? 40}; ` : "";
    const startup = options.startup ? `${options.startup}; ` : "";
    const shell = `cd ${shellQuote(host.cwd)}; ${env}${startup}exec "$SHELL" -l`;
    const child = spawn("ssh", ["-tt", ...baseArgs(host), shell], { stdio: ["pipe", "pipe", "pipe"] });
    const session = { id, hostId: host.id, child, output: [], startedAt: new Date().toISOString() };
    child.stdout.on("data", (chunk) => session.output.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => session.output.push(Buffer.from(chunk)));
    child.on("close", () => sessions.delete(id));
    sessions.set(id, session);
    return session;
}
export async function writeSession(id, input, waitMs, maxBytes) {
    const session = sessions.get(id);
    if (!session)
        throw new Error(`session not found: ${id}`);
    if (!session.child.stdin)
        throw new Error(`session is not writable: ${id}`);
    session.child.stdin.write(input);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    const output = Buffer.concat(session.output).toString("utf8");
    session.output = [];
    return truncate(output, maxBytes).text;
}
export function closeSession(id) {
    const session = sessions.get(id);
    if (!session)
        return false;
    session.child.kill("SIGTERM");
    sessions.delete(id);
    return true;
}
export function listSessions() {
    return [...sessions.values()];
}
