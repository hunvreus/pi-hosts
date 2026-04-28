import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { truncate } from "../format.js";
import type { ExecResult, ResolvedHost } from "../types.js";

export type ExecOptions = {
  timeoutMs: number;
  maxBytes: number;
};

export type SessionOpenOptions = {
  cols?: number;
  rows?: number;
  startup?: string;
};

export type RemoteSession = {
  id: string;
  hostId: string;
  child: ReturnType<typeof spawn>;
  output: Buffer[];
  startedAt: string;
};

const sessions = new Map<string, RemoteSession>();

type Capture = {
  chunks: Buffer[];
  bytes: number;
  truncated: boolean;
};

function appendBounded(capture: Capture, chunk: Buffer, maxBytes: number): void {
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

function controlPath(host: ResolvedHost): string {
  const dir = "/tmp/pi-hosts";
  mkdirSync(dir, { recursive: true });
  const key = `${host.id}|${host.destination}|${host.port ?? 22}|${host.identityFile ?? ""}|${host.proxyJump ?? ""}`;
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return join(dir, `${hash}.sock`);
}

export function sshControlPathForTest(host: ResolvedHost): string {
  return controlPath(host);
}

function baseArgs(host: ResolvedHost): string[] {
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
  if (host.port) args.push("-p", String(host.port));
  if (host.identityFile) args.push("-i", host.identityFile);
  if (host.proxyJump) args.push("-J", host.proxyJump);
  args.push(host.destination);
  return args;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function remoteCommand(host: ResolvedHost, command: string): string {
  return `cd ${shellQuote(host.cwd)} && ${command}`;
}

export function runSsh(host: ResolvedHost, command: string, options: ExecOptions): Promise<ExecResult> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [...baseArgs(host), remoteCommand(host, command)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Capture = { chunks: [], bytes: 0, truncated: false };
    const stderr: Capture = { chunks: [], bytes: 0, truncated: false };
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

export function openSession(host: ResolvedHost, options: SessionOpenOptions = {}): RemoteSession {
  const id = randomUUID();
  const env = options.cols || options.rows ? `stty cols ${options.cols ?? 120} rows ${options.rows ?? 40}; ` : "";
  const startup = options.startup ? `${options.startup}; ` : "";
  const shell = `cd ${shellQuote(host.cwd)}; ${env}${startup}exec "$SHELL" -l`;
  const child = spawn("ssh", ["-tt", ...baseArgs(host), shell], { stdio: ["pipe", "pipe", "pipe"] });
  const session: RemoteSession = { id, hostId: host.id, child, output: [], startedAt: new Date().toISOString() };
  child.stdout.on("data", (chunk) => session.output.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => session.output.push(Buffer.from(chunk)));
  child.on("close", () => sessions.delete(id));
  sessions.set(id, session);
  return session;
}

export async function writeSession(id: string, input: string, waitMs: number, maxBytes: number): Promise<string> {
  const session = sessions.get(id);
  if (!session) throw new Error(`session not found: ${id}`);
  if (!session.child.stdin) throw new Error(`session is not writable: ${id}`);
  session.child.stdin.write(input);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  const output = Buffer.concat(session.output).toString("utf8");
  session.output = [];
  return truncate(output, maxBytes).text;
}

export function closeSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  session.child.kill("SIGTERM");
  sessions.delete(id);
  return true;
}

export function listSessions(): RemoteSession[] {
  return [...sessions.values()];
}
