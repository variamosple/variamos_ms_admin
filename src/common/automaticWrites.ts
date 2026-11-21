import { isIP } from "node:net";
import { NodeEnvs } from "#src/common/misc.js";

/**
 * The setting the production database carries, set once by its owner:
 * ALTER DATABASE "VariamosDB" SET variamos.environment = 'production'
 * Every connection reads it, through an SSH tunnel as well (ADM-N32).
 */
export const DATABASE_ENVIRONMENT_SETTING = "variamos.environment";

/** Lets a workstation migrate and run the jobs on a remote database. */
export const ALLOW_REMOTE_WRITES_VARIABLE =
  "ALLOW_AUTOMATIC_WRITES_ON_REMOTE_DATABASE";

// The machine that runs the container, as Docker and Podman name it: the
// test compose files reach the database of the workstation this way
const CONTAINER_HOST_NAMES = new Set([
  "host.docker.internal",
  "gateway.docker.internal",
  "host.containers.internal",
]);

/**
 * A database on this machine or in the same Compose project: a loopback
 * address, localhost, the host of the container, or a service name without
 * a dot (db, postgres).
 * An address or a domain name is remote. A tunnel to a remote database
 * looks local: the setting of the database covers that case.
 */
export function isLocalDatabaseHost(host: string): boolean {
  const name = host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");
  if (
    name === "" ||
    name === "localhost" ||
    name.endsWith(".localhost") ||
    CONTAINER_HOST_NAMES.has(name)
  ) {
    return true;
  }
  const family = isIP(name);
  if (family === 4) return name.startsWith("127.");
  if (family === 6) return name === "::1";
  return !name.includes(".");
}

export type AutomaticWrites =
  | { allowed: true; warning?: string }
  | { allowed: false; reason: string };

export interface DatabaseTarget {
  nodeEnv: string;
  host: string;
  /** The value of variamos.environment, null when the database has none */
  databaseEnvironment: string | null;
  /** The value of ALLOW_AUTOMATIC_WRITES_ON_REMOTE_DATABASE */
  allowRemote: string | undefined;
}

/**
 * Whether the service may write to its database without being asked:
 * migrations, encryption of the configurations, background jobs. A
 * workstation linked to the production database applied the migrations of
 * its branch and ran the purges, the GitHub sync and the alerts there.
 */
export function decideAutomaticWrites(target: DatabaseTarget): AutomaticWrites {
  if (target.nodeEnv === NodeEnvs.Production.valueOf()) {
    return { allowed: true };
  }
  const remote = describeRemoteDatabase(target);
  if (remote === null) {
    return { allowed: true };
  }
  if (target.allowRemote === "true") {
    return {
      allowed: true,
      warning: `${remote}, and ${ALLOW_REMOTE_WRITES_VARIABLE} lets this service migrate and run its jobs on it`,
    };
  }
  return { allowed: false, reason: remote };
}

function describeRemoteDatabase(target: DatabaseTarget): string | null {
  if (target.databaseEnvironment === NodeEnvs.Production.valueOf()) {
    return "the database says it is the production database";
  }
  if (!isLocalDatabaseHost(target.host)) {
    return "the database host is not on this machine";
  }
  return null;
}
