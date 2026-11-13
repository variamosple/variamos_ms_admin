import type Docker from "dockerode";

/**
 * How the admin reaches Docker (EV-71 lot 2). DOCKER_HOST names the socket
 * proxy, which lets through only the calls the monitoring makes: listing and
 * inspecting containers, reading their logs, starting, stopping and
 * restarting them. Without it, the admin opens the socket itself, as before.
 */
export const dockerOptionsOf = (env: {
  host: string;
  socketPath: string;
}): Docker.DockerOptions => {
  const host = env.host.trim();
  if (!host) return { socketPath: env.socketPath };
  const url = new URL(host);
  if (url.protocol === "unix:") return { socketPath: url.pathname };
  if (url.protocol !== "tcp:" && url.protocol !== "http:") {
    throw new Error(
      `DOCKER_HOST must be tcp://<host>:<port> or unix://<path>, not ${url.protocol}`,
    );
  }
  return {
    protocol: "http",
    host: url.hostname,
    port: Number(url.port || 2375),
  };
};
