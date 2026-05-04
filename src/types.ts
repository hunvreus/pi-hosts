export type Protocol = "ssh";

export type HostFacts = {
  hostname?: string;
  os?: string;
  arch?: string;
  kernel?: string;
  distro?: string;
  pkgManager?: string;
  serviceManager?: string;
  containerRuntime?: string;
  hasSudo?: boolean;
};

export type HostRecord = {
  id: string;
  name: string;
  address: string;
  protocol: Protocol;
  user?: string;
  port?: number;
  identityFile?: string;
  proxyJump?: string;
  cwd?: string;
  bastionHostId?: string | null;
  aliases: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  facts: HostFacts;
  createdAt: string;
  updatedAt: string;
};

export type HostStore = {
  version: 1;
  hosts: HostRecord[];
};

export type ResolvedHost = HostRecord & {
  destination: string;
  cwd: string;
};

export type TurnState = {
  activeHostId: string | null;
  turnHostIds: string[];
};

export type RiskLevel = "safe" | "caution" | "danger" | "critical";
export type ApprovalDecision = "run" | "confirm" | "block";
export type ApprovalMode = "strict" | "balanced" | "paranoid" | "manual" | "off";
export type PolicyBackend = "local";

export type RiskAssessment = {
  level: RiskLevel;
  reasons: string[];
  backend: PolicyBackend;
  decision: ApprovalDecision;
  approval: ApprovalMode;
};

export type AuditEntry = {
  timestamp: string;
  hosts: string[];
  command: string;
  risk: RiskLevel;
  decision: ApprovalDecision;
  approval: ApprovalMode;
  allowed: boolean;
  confirmed: boolean;
  rejected: boolean;
  reasons: string[];
  exitCode?: number;
  durationMs: number;
  truncated: boolean;
  timedOut: boolean;
};

export type ExecResult = {
  host: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
};
