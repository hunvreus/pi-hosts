import type { HostFacts, ResolvedHost } from "./types.js";

export function factsText(facts: HostFacts): string {
  return [
    `hostname=${facts.hostname ?? "unknown"}`,
    `os=${facts.os ?? "unknown"}`,
    `arch=${facts.arch ?? "unknown"}`,
    `kernel=${facts.kernel ?? "unknown"}`,
    `distro=${facts.distro ?? "unknown"}`,
    `pkg=${facts.pkgManager ?? "unknown"}`,
    `service=${facts.serviceManager ?? "unknown"}`,
    `container=${facts.containerRuntime ?? "unknown"}`,
    `sudo=${facts.hasSudo === undefined ? "unknown" : facts.hasSudo ? "yes" : "no"}`,
  ].join(", ");
}

export function inventoryText(hosts: ResolvedHost[]): string {
  if (hosts.length === 0) return "none";
  return hosts
    .map((host) => {
      const aliases = host.aliases.length > 0 ? ` aliases=${host.aliases.join(",")}` : "";
      const tags = host.tags.length > 0 ? ` tags=${host.tags.join(",")}` : "";
      return `${host.name}=${host.destination}${aliases}${tags}`;
    })
    .join("\n");
}

export function hostDetail(host: ResolvedHost): string {
  return [
    `${host.name}`,
    `- id: ${host.id}`,
    `- address: ${host.address}`,
    `- destination: ${host.destination}`,
    `- cwd: ${host.cwd}`,
    `- aliases: ${host.aliases.join(", ") || "(none)"}`,
    `- tags: ${host.tags.join(", ") || "(none)"}`,
    `- facts: ${factsText(host.facts)}`,
  ].join("\n");
}

export function truncate(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const buffer = Buffer.from(value);
  if (buffer.byteLength <= maxBytes) return { text: value, truncated: false };
  return { text: `${buffer.subarray(0, maxBytes).toString("utf8")}\n...truncated...`, truncated: true };
}
