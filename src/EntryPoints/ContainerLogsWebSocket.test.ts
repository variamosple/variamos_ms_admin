import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import logger from "jet-logger";
import { WebSocket } from "ws";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import {
  attachContainerLogsWebSocket,
  type ContainerLogsDependencies,
  isAllowedOrigin,
} from "./ContainerLogsWebSocket.js";

const ALLOWED = [/^https:\/\/app\.variamos\.com$/];

describe("isAllowedOrigin", () => {
  it("allows a listed origin and refuses another", () => {
    expect(isAllowedOrigin("https://app.variamos.com", ALLOWED)).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com", ALLOWED)).toBe(false);
  });

  it("allows a client without Origin, which still needs the permission", () => {
    expect(isAllowedOrigin(undefined, ALLOWED)).toBe(true);
  });
});

describe("container logs WebSocket", () => {
  let server: Server;
  let url: string;
  let deps: ContainerLogsDependencies & {
    checkAccess: ReturnType<typeof vi.fn>;
    watchLogs: ReturnType<typeof vi.fn>;
  };
  const streams: PassThrough[] = [];

  const start = async (overrides: Partial<ContainerLogsDependencies> = {}) => {
    deps = {
      allowedOrigins: ALLOWED,
      checkAccess: vi.fn().mockResolvedValue({ data: {} }),
      watchLogs: vi.fn().mockImplementation(async () => {
        const stream = new PassThrough();
        streams.push(stream);
        return new ResponseModel<NodeJS.ReadableStream>("tx").withResponse(
          stream,
        );
      }),
      ...overrides,
    } as typeof deps;
    server = createServer();
    attachContainerLogsWebSocket(server, deps);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  const open = (origin = "https://app.variamos.com") =>
    new WebSocket(url, {
      headers: { Cookie: "authToken=session-token" },
      origin,
    });

  const closed = (ws: WebSocket) =>
    new Promise<{ code: number; reason: string }>((resolve) =>
      ws.on("close", (code, reason) =>
        resolve({ code, reason: reason.toString() }),
      ),
    );

  const nextMessage = (ws: WebSocket) =>
    new Promise<string>((resolve) =>
      ws.once("message", (data) => resolve(data.toString())),
    );

  beforeEach(() => {
    vi.spyOn(logger, "err").mockImplementation(() => {});
    streams.length = 0;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    vi.restoreAllMocks();
  });

  it("refuses an origin that is not listed", async () => {
    await start();
    const ws = open("https://evil.example.com");

    const error = await new Promise<Error>((resolve) =>
      ws.on("error", resolve),
    );

    expect(error.message).toContain("401");
    expect(deps.checkAccess).not.toHaveBeenCalled();
  });

  it("closes the socket of a session without the logs permission", async () => {
    await start({
      checkAccess: vi.fn().mockResolvedValue({ errorCode: 403 }),
    });
    const ws = open();
    ws.on("open", () => ws.send(JSON.stringify({ microserviceId: "svc" })));

    await expect(closed(ws)).resolves.toEqual({
      code: 1008,
      reason: "Access denied",
    });
    expect(deps.checkAccess).toHaveBeenCalledWith("session-token");
    expect(deps.watchLogs).not.toHaveBeenCalled();
  });

  it("streams the logs asked for right after opening", async () => {
    await start();
    const ws = open();
    ws.on("open", () =>
      ws.send(JSON.stringify({ microserviceId: "variamos_ms_languages" })),
    );
    await vi.waitFor(() => expect(streams).toHaveLength(1));

    const received = nextMessage(ws);
    streams[0]?.write("line 1\n");

    await expect(received).resolves.toBe("line 1\n");
    expect(deps.watchLogs).toHaveBeenCalledWith(
      expect.objectContaining({ data: "variamos_ms_languages" }),
    );
    ws.close();
  });

  it("follows one stream at a time: a new request closes the previous one", async () => {
    await start();
    const ws = open();
    await new Promise((resolve) => ws.on("open", resolve));

    ws.send(JSON.stringify({ microserviceId: "svc-a" }));
    await vi.waitFor(() => expect(streams).toHaveLength(1));
    ws.send(JSON.stringify({ microserviceId: "svc-b" }));
    await vi.waitFor(() => expect(streams).toHaveLength(2));

    expect(streams[0]?.destroyed).toBe(true);
    expect(streams[1]?.destroyed).toBe(false);
    ws.close();
  });

  it("closes the stream when the socket closes", async () => {
    await start();
    const ws = open();
    ws.on("open", () => ws.send(JSON.stringify({ microserviceId: "svc" })));
    await vi.waitFor(() => expect(streams).toHaveLength(1));

    ws.close();

    await vi.waitFor(() => expect(streams[0]?.destroyed).toBe(true));
  });

  it.each([
    ["not JSON", "hello"],
    ["no id", JSON.stringify({})],
    ["a too long id", JSON.stringify({ microserviceId: "x".repeat(129) })],
  ])("answers an error for a message with %s", async (_label, message) => {
    await start();
    const ws = open();
    ws.on("open", () => ws.send(message));

    await expect(nextMessage(ws)).resolves.toContain(
      "A valid microserviceId is required.",
    );
    expect(deps.watchLogs).not.toHaveBeenCalled();
    ws.close();
  });

  it("closes the socket when the session expires", async () => {
    const exp = 2_000_000_000;
    await start({
      checkAccess: vi.fn().mockResolvedValue({ data: { exp } }),
      now: () => exp * 1000 - 100,
    });
    const ws = open();

    await expect(closed(ws)).resolves.toEqual({
      code: 1008,
      reason: "Session expired",
    });
  });
});
