import { EventEmitter } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  closeWebSockets,
  onShutdownSignals,
  type ShutdownParts,
  shutDown,
} from "./GracefulShutdown.js";

vi.mock("#src/common/logger.js");

/**
 * A real server: /slow answers after `slowMs`, /never never answers. The
 * order of the calls is kept, to check what closes before what.
 */
async function startServer(slowMs = 150) {
  const server = http.createServer((req, res) => {
    if (req.url === "/never") return;
    setTimeout(() => res.end("done"), req.url === "/slow" ? slowMs : 0);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

const partsOf = (server: http.Server, graceMs = 2000) => {
  const order: string[] = [];
  const parts: ShutdownParts = {
    server,
    closeSockets: vi.fn(() => {
      order.push("sockets");
    }),
    stopJobs: vi.fn(() => {
      order.push("jobs");
    }),
    closeDatabase: vi.fn(async () => {
      order.push("database");
    }),
    graceMs,
  };
  return { parts, order };
};

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const get = async (url: string) => {
  const response = await fetch(url);
  return { status: response.status, text: await response.text() };
};

describe("graceful shutdown (ADM-N21)", () => {
  it("lets a request under way finish, then closes the database", async () => {
    const { server, url } = await startServer();
    const { parts, order } = partsOf(server);
    const slow = get(`${url}/slow`);
    // The request reaches the server before the shutdown starts
    await pause(30);

    const done = shutDown(parts, "SIGTERM");
    const answer = await slow;
    order.push("answered");
    await done;

    expect(answer).toEqual({ status: 200, text: "done" });
    expect(order).toEqual(["jobs", "sockets", "answered", "database"]);
    expect(server.listening).toBe(false);
  });

  it("takes no new connection once it shuts down", async () => {
    const { server, url } = await startServer();
    const { parts } = partsOf(server);

    await shutDown(parts, "SIGTERM");

    await expect(fetch(`${url}/fast`)).rejects.toThrow();
  });

  it("cuts a request still open after the grace time", async () => {
    const { server, url } = await startServer();
    const { parts } = partsOf(server, 100);
    const never = fetch(`${url}/never`).catch((error: unknown) => error);
    await pause(30);
    const startedAt = Date.now();

    await shutDown(parts, "SIGTERM");

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(await never).toBeInstanceOf(Error);
    expect(parts.closeDatabase).toHaveBeenCalledOnce();
  });

  it("still ends when the database does not close", async () => {
    const { server } = await startServer();
    const { parts } = partsOf(server);
    parts.closeDatabase = vi.fn(async () => {
      throw new Error("already closed");
    });

    await expect(shutDown(parts, "SIGTERM")).resolves.toBeUndefined();
  });

  it("shuts down on SIGTERM and exits with 0, and at once on a second signal", async () => {
    const { server } = await startServer();
    const { parts } = partsOf(server);
    const signals = new EventEmitter();
    const exit = vi.fn();
    onShutdownSignals(parts, { exit, signals });

    signals.emit("SIGTERM", "SIGTERM");
    signals.emit("SIGINT", "SIGINT");
    expect(exit).toHaveBeenCalledWith(1);

    await vi.waitFor(() => expect(exit).toHaveBeenLastCalledWith(0));
    expect(parts.stopJobs).toHaveBeenCalledOnce();
  });

  it("closes each container logs socket, then the socket server", () => {
    const client = { close: vi.fn() };
    const sockets = { clients: new Set([client]), close: vi.fn() };

    closeWebSockets(sockets as never);

    expect(client.close).toHaveBeenCalledWith(1001, "Server shutting down");
    expect(sockets.close).toHaveBeenCalledOnce();
  });
});
