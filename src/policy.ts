import type { PolicyConfig } from "./config.js";
import type { ApprovalDecision, ApprovalMode, RiskAssessment, RiskLevel } from "./types.js";

type Token =
  | { type: "word"; value: string }
  | { type: "op"; value: "|" | "&&" | "||" | ";" | "&" | ">" | ">>" | "<" | "<<" | "<<<" };
type OpValue = Extract<Token, { type: "op" }>["value"];

const order: Record<RiskLevel, number> = { safe: 0, caution: 1, danger: 2, critical: 3 };

const approvalModes: Record<ApprovalMode, Record<RiskLevel, ApprovalDecision>> = {
  strict: { safe: "run", caution: "confirm", danger: "confirm", critical: "block" },
  balanced: { safe: "run", caution: "run", danger: "confirm", critical: "block" },
  paranoid: { safe: "confirm", caution: "confirm", danger: "confirm", critical: "block" },
  manual: { safe: "confirm", caution: "confirm", danger: "confirm", critical: "confirm" },
  off: { safe: "run", caution: "run", danger: "run", critical: "run" },
};

const mutatingSubcommands = new Map<string, Set<string>>([
  ["systemctl", new Set(["restart", "stop", "start", "enable", "disable", "reload", "kill", "mask", "unmask"])],
  ["service", new Set(["restart", "stop", "start", "reload"])],
  ["docker", new Set(["delete", "rm", "rmi", "run", "stop", "restart", "compose", "build", "push", "pull", "exec"])],
  ["podman", new Set(["delete", "rm", "rmi", "run", "stop", "restart", "build", "push", "pull", "exec"])],
  ["kubectl", new Set(["apply", "delete", "replace", "scale", "rollout", "patch", "create", "edit", "exec"])],
  ["helm", new Set(["install", "upgrade", "delete", "uninstall", "rollback"])],
  ["apt", new Set(["install", "remove", "purge", "upgrade", "dist-upgrade", "update"])],
  ["apt-get", new Set(["install", "remove", "purge", "upgrade", "dist-upgrade", "update"])],
  ["dnf", new Set(["install", "remove", "upgrade", "update"])],
  ["yum", new Set(["install", "remove", "upgrade", "update"])],
  ["apk", new Set(["add", "del", "upgrade", "update"])],
  ["zypper", new Set(["install", "remove", "update"])],
  ["brew", new Set(["install", "uninstall", "upgrade", "update"])],
]);

const networkCommands = new Set(["curl", "wget", "nc", "netcat", "scp", "rsync", "ssh", "sftp"]);
const shellCommands = new Set(["sh", "bash", "zsh", "fish", "ksh", "dash", "python", "python3", "perl", "ruby", "node"]);
const sensitiveReaders = new Set(["cat", "grep", "head", "tail", "sed", "awk", "less", "more"]);
const operationalCommands = new Set(["systemctl", "service", "docker", "podman", "kubectl", "helm"]);
const readOnlyFlags = new Set(["--help", "-h", "--version", "-v", "-V", "version", "help"]);
const readOnlySubcommands = new Set([
  "config",
  "describe",
  "diff",
  "events",
  "get",
  "help",
  "history",
  "images",
  "info",
  "inspect",
  "list",
  "logs",
  "ls",
  "port",
  "ps",
  "search",
  "show",
  "status",
  "top",
  "version",
]);

function basename(value: string): string {
  const index = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  return index >= 0 ? value.slice(index + 1) : value;
}

function addRisk(current: RiskLevel, next: RiskLevel): RiskLevel {
  return order[next] > order[current] ? next : current;
}

function tokenize(input: string): { tokens: Token[]; error?: string; substitution: boolean } {
  const tokens: Token[] = [];
  let value = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let substitution = false;

  function pushWord(): void {
    if (!value) return;
    tokens.push({ type: "word", value });
    value = "";
  }

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] ?? "";
    const next = input[i + 1] ?? "";
    const third = input[i + 2] ?? "";
    if (escaped) {
      value += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      value += char;
      continue;
    }
    if ((char === "'" || char === '"') && !quote) {
      quote = char;
      value += char;
      continue;
    }
    if (char === quote) {
      quote = null;
      value += char;
      continue;
    }
    if (!quote && char === "$" && next === "(") substitution = true;
    if (!quote && char === "`") substitution = true;
    if (!quote && /\s/.test(char)) {
      pushWord();
      continue;
    }
    if (!quote) {
      const two = `${char}${next}`;
      const op: OpValue | "" =
        `${two}${third}` === "<<<"
          ? "<<<"
          : two === "&&" || two === "||" || two === ">>" || two === "<<"
            ? two
            : char === "|" || char === ";" || char === "&" || char === ">" || char === "<"
              ? char
              : "";
      if (op) {
        pushWord();
        tokens.push({ type: "op", value: op });
        i += op.length - 1;
        continue;
      }
    }
    value += char;
  }
  if (quote) return { tokens, error: `unterminated ${quote} quote`, substitution };
  pushWord();
  return { tokens, substitution };
}

function commandSegments(tokens: Token[]): string[][] {
  const segments: string[][] = [];
  let current: string[] = [];
  for (const token of tokens) {
    if (token.type === "word") {
      current.push(token.value);
      continue;
    }
    if (token.value === "|" || token.value === ";" || token.value === "&&" || token.value === "||" || token.value === "&") {
      if (current.length > 0) segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function unquote(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}

function isAssignment(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(value);
}

function commandName(segment: string[]): string | null {
  for (const word of segment) {
    if (isAssignment(word)) continue;
    return basename(unquote(word));
  }
  return null;
}

function commandArgs(segment: string[]): string[] {
  const index = segment.findIndex((word) => !isAssignment(word));
  return index < 0 ? [] : segment.slice(index + 1).map(unquote);
}

function hasSensitive(value: string, sensitive: string[]): boolean {
  const normalized = unquote(value);
  return sensitive.some((item) => {
    if (item.startsWith("~/")) return normalized.startsWith(item) || normalized.includes(item.slice(2));
    return normalized === item || normalized.includes(`/${item}`) || normalized.includes(item);
  });
}

function hasRecursiveForce(segment: string[]): boolean {
  let recursive = false;
  let force = false;
  for (const word of segment) {
    const value = unquote(word);
    if (value === "--recursive") recursive = true;
    if (value === "--force") force = true;
    if (/^-[a-zA-Z]*r/.test(value)) recursive = true;
    if (/^-[a-zA-Z]*f/.test(value)) force = true;
  }
  return recursive && force;
}

function dangerousRmTarget(segment: string[]): boolean {
  return segment.some((word) => ["/", "/*", "*", "~", "~/", "$HOME", "${HOME}"].includes(unquote(word)));
}

function isReadOnlyProbe(args: string[]): boolean {
  return args.length > 0 && args.some((arg) => readOnlyFlags.has(arg));
}

function isReadOnlySubcommand(subcommand: string | undefined): boolean {
  return !!subcommand && readOnlySubcommands.has(subcommand);
}

function sudoInnerSegment(args: string[]): string[] {
  const inner: string[] = [];
  let commandStarted = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (!commandStarted && arg === "--") {
      commandStarted = true;
      continue;
    }
    if (!commandStarted && ["-u", "-g", "-h", "-p", "-C", "-T"].includes(arg)) {
      i += 1;
      continue;
    }
    if (!commandStarted && arg.startsWith("-")) continue;
    commandStarted = true;
    inner.push(arg);
  }
  return inner;
}

function classifySegment(segment: string[], policy: PolicyConfig, reasons: string[]): RiskLevel {
  const name = commandName(segment);
  if (!name) return "caution";
  const args = commandArgs(segment);
  const subcommand = args.find((arg) => !arg.startsWith("-"));

  if (policy.commands.block.includes(name)) {
    reasons.push(`blocked command: ${name}`);
    return "critical";
  }
  if (name === "rm" && hasRecursiveForce(args) && dangerousRmTarget(args)) {
    reasons.push("destructive recursive remove");
    return "critical";
  }
  if (name === "dd" && args.some((arg) => /^of=\/dev\//.test(arg))) {
    reasons.push("raw block-device write");
    return "critical";
  }
  if (isReadOnlyProbe(args) && !policy.commands.block.includes(name)) {
    reasons.push(`${name} read-only probe`);
    return policy.commands.safe.includes(name) ? "safe" : "caution";
  }
  if (name === "sudo") {
    const inner = sudoInnerSegment(args);
    const innerReasons: string[] = [];
    const innerRisk = inner.length > 0 ? classifySegment(inner, policy, innerReasons) : "danger";
    if (innerRisk === "critical") {
      reasons.push("sudo critical command", ...innerReasons);
      return "critical";
    }
    if (innerRisk === "safe" || innerRisk === "caution") {
      reasons.push("sudo read-only command", ...innerReasons);
      return "caution";
    }
    reasons.push("sudo command", ...innerReasons);
    return "danger";
  }
  if (policy.commands.confirm.includes(name)) {
    const mutating = subcommand && mutatingSubcommands.get(name)?.has(subcommand);
    const flagOnly = !subcommand && args.every((arg) => arg.startsWith("-"));
    if (!mutating && (isReadOnlySubcommand(subcommand) || (operationalCommands.has(name) && flagOnly))) {
      reasons.push(`review ${name} command`);
      return "caution";
    }
    reasons.push(mutating ? `${name} mutation` : `${name} command`);
    return "danger";
  }
  if (segment.some((word) => hasSensitive(word, policy.sensitive))) {
    reasons.push(`sensitive path referenced by ${name}`);
    return sensitiveReaders.has(name) ? "danger" : "caution";
  }
  if (policy.commands.safe.includes(name)) return "safe";
  reasons.push(`unknown command: ${name}`);
  return "caution";
}

function hasOutputRedirect(tokens: Token[]): boolean {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token?.type !== "op" || (token.value !== ">" && token.value !== ">>")) continue;
    const previous = tokens[i - 1];
    const next = tokens[i + 1];
    const redirectsFd = previous?.type === "word" && /^\d+$/.test(previous.value);
    const target = next?.type === "word" ? unquote(next.value) : "";
    if (redirectsFd && target === "/dev/null") continue;
    return true;
  }
  return false;
}

function hasSensitiveNetworkFlow(segments: string[][], policy: PolicyConfig): boolean {
  let sensitiveSeen = false;
  for (const segment of segments) {
    const name = commandName(segment);
    if (!name) continue;
    if (segment.some((word) => hasSensitive(word, policy.sensitive))) sensitiveSeen = true;
    if (sensitiveSeen && networkCommands.has(name)) return true;
  }
  return false;
}

function hasNetworkToShellFlow(segments: string[][]): boolean {
  let networkSeen = false;
  for (const segment of segments) {
    const name = commandName(segment);
    if (!name) continue;
    if (networkCommands.has(name)) networkSeen = true;
    if (networkSeen && shellCommands.has(name)) return true;
  }
  return false;
}

export function decide(level: RiskLevel, mode: ApprovalMode): ApprovalDecision {
  return approvalModes[mode][level];
}

export function assess(command: string, hostCount: number, policy: PolicyConfig): RiskAssessment {
  const reasons: string[] = [];
  const parsed = tokenize(command);
  let level: RiskLevel = "safe";
  if (parsed.error) {
    reasons.push(parsed.error);
    level = addRisk(level, "danger");
  }
  if (parsed.substitution) {
    reasons.push("command substitution");
    level = addRisk(level, "danger");
  }
  if (hasOutputRedirect(parsed.tokens)) {
    reasons.push("shell output redirection");
    level = addRisk(level, "danger");
  }

  const segments = commandSegments(parsed.tokens);
  for (const segment of segments) {
    level = addRisk(level, classifySegment(segment, policy, reasons));
  }
  if (hasNetworkToShellFlow(segments)) {
    reasons.push("network content piped to executable");
    level = addRisk(level, "critical");
  }
  if (hasSensitiveNetworkFlow(segments, policy)) {
    reasons.push("sensitive data sent to network command");
    level = addRisk(level, "critical");
  }
  if (hostCount > 1) {
    reasons.push("multi-host execution");
    level = addRisk(level, "danger");
  }
  if (reasons.length === 0) reasons.push("read-only command");
  return {
    level,
    reasons: [...new Set(reasons)],
    backend: policy.backend,
    approval: policy.approval,
    decision: decide(level, policy.approval),
  };
}
