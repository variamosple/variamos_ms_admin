import type Docker from "dockerode";
import type { ContainerInstanceInfo } from "#src/Domain/MicroService/Entity/MicroServiceDetailed.js";
import type { ServiceDefinition } from "#src/Domain/MicroService/Entity/ServiceDefinition.js";

/**
 * IP addresses of a container on every Docker network it is attached to.
 * Probing these avoids DNS lookups, which stall for seconds on unknown names.
 */
export function containerIpsOf(container: {
  NetworkSettings?: { Networks?: Record<string, { IPAddress?: string }> };
}): string[] {
  return Object.values(container.NetworkSettings?.Networks ?? {})
    .map((network) => network.IPAddress)
    .filter((ip): ip is string => Boolean(ip));
}

/**
 * A container is a monitored microservice only when it carries the explicit
 * `variamos.service.monitored=true` label.
 */
export function isMonitoredContainer(labels: Record<string, string>): boolean {
  return labels["variamos.service.monitored"] === "true";
}

/**
 * The service a container runs, read from its labels, else from its compose
 * service or container name. Null for a container that is not monitored.
 */
export function serviceDefinitionOf(
  c: Docker.ContainerInfo,
): ServiceDefinition | null {
  const labels = c.Labels || {};
  // Only containers that explicitly opt in are monitored. Matching on
  // compose service names also picked up front-end containers and duplicate deployments.
  if (!isMonitoredContainer(labels)) return null;
  const composeService = labels["com.docker.compose.service"];

  const rawServiceName =
    labels["variamos.service.name"] ||
    composeService?.replace(/-/g, "_") ||
    c.Names[0]
      ?.replace(/^\//, "")
      .replace(/-test$/, "")
      .replace(/-/g, "_");
  if (!rawServiceName) return null;

  const rawDisplayName =
    labels["variamos.service.display-name"] ||
    rawServiceName
      .split("_")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");

  const internalPort = labels["variamos.service.internal-port"]
    ? Number.parseInt(labels["variamos.service.internal-port"], 10)
    : c.Ports?.[0]?.PrivatePort || 4000;

  // Determine targetUrl: if host port is published use localhost, else use internal container alias
  const hostPort = c.Ports?.find((p) => p.PublicPort)?.PublicPort;
  const targetUrl = hostPort
    ? `http://localhost:${hostPort}`
    : `http://${composeService || rawServiceName}:${internalPort}`;

  return {
    name: rawServiceName,
    displayName: rawDisplayName,
    targetUrl,
    containerNamePattern: composeService || rawServiceName.replace(/_/g, "-"),
    containerIps: containerIpsOf(c),
    defaultPort: internalPort,
    healthPath: labels["variamos.service.health-path"] || "/health",
  };
}

// A container belongs to a service by its label, compose name or name pattern
export function belongsTo(
  c: Docker.ContainerInfo,
  def: ServiceDefinition,
): boolean {
  const labels = c.Labels || {};
  if (labels["variamos.service.name"] === def.name) return true;
  if (labels["com.docker.compose.service"] === def.containerNamePattern) {
    return true;
  }
  const name = def.name.toLowerCase();
  const pattern = def.containerNamePattern?.toLowerCase();
  return c.Names.some((n) => {
    const cleanN = n.replace(/^\//, "").toLowerCase();
    return (
      cleanN === name ||
      cleanN.includes(name.replace(/_/g, "-")) ||
      Boolean(pattern && cleanN.includes(pattern))
    );
  });
}

export const containerInfoOf = (
  c: Docker.ContainerInfo,
): ContainerInstanceInfo => ({
  id: c.Id,
  name: c.Names[0]?.replace(/^\//, "") ?? c.Id,
  state: c.State,
  status: c.Status,
  created: new Date(c.Created * 1000),
  labels: c.Labels,
});
