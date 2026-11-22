import net from "node:net";
import { CountriesRepositoryImpl } from "#src/DataProviders/Countries/CountriesRepository.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import {
  createGitHubHttp,
  GITHUB_TIMEOUT_MS,
} from "#src/Infrastructure/GitHub/githubHttp.js";
import { MailServiceImpl } from "#src/Infrastructure/Mail/MailService.js";
import { NotificationClient } from "#src/Infrastructure/Notification/NotificationClient.js";

vi.mock("#src/common/logger.js");

// The limits given to the clients here; their defaults are seconds long
const LIMIT_MS = 100;
// Well below the defaults: the call was cut by the limit, not by the test
const CUT_WITHIN_MS = 2000;

/**
 * A server that takes the connection and never says a word: no HTTP
 * answer, no SMTP greeting. The fault each limit is there for (ADM-N33).
 */
async function startSilentServer() {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as net.AddressInfo;
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

const elapsedMs = async (call: () => Promise<unknown>) => {
  const startedAt = Date.now();
  await call();
  return Date.now() - startedAt;
};

describe("outgoing calls to a server that does not answer (ADM-N33)", () => {
  let silent: Awaited<ReturnType<typeof startSilentServer>>;

  beforeEach(async () => {
    silent = await startSilentServer();
  });

  afterEach(async () => {
    await silent.close();
  });

  it("gives GitHub 10 s by default", () => {
    expect(GITHUB_TIMEOUT_MS).toBe(10_000);
    expect(createGitHubHttp().defaults.timeout).toBe(10_000);
  });

  it("cuts a GitHub call at its limit", async () => {
    const http = createGitHubHttp(LIMIT_MS);
    let failure: unknown;

    const elapsed = await elapsedMs(() =>
      http.get(`${silent.url}/repos/x/y/issues`).catch((error: unknown) => {
        failure = error;
      }),
    );

    expect(failure).toMatchObject({ code: "ECONNABORTED" });
    expect(elapsed).toBeLessThan(CUT_WITHIN_MS);
  });

  it("cuts a notification dispatch at its limit", async () => {
    const client = new NotificationClient({
      serviceUrl: silent.url,
      internalToken: "internal-token",
      timeoutMs: LIMIT_MS,
    });
    let failure: unknown;

    const elapsed = await elapsedMs(() =>
      client
        .dispatchNotification({
          eventId: "e1",
          type: "info",
          title: "Title",
          message: "Message",
          recipients: { userIds: ["u1"] },
        } as never)
        .catch((error: unknown) => {
          failure = error;
        }),
    );

    expect(failure).toBeInstanceOf(Error);
    expect(elapsed).toBeLessThan(CUT_WITHIN_MS);
  });

  it("skips the country of an address when the lookup does not answer", async () => {
    const repository = new CountriesRepositoryImpl({
      baseUrl: silent.url,
      timeoutMs: LIMIT_MS,
    });
    let errorCode: unknown;

    const elapsed = await elapsedMs(async () => {
      const response = await repository.getIpCountryCode(
        new RequestModel("t", "203.0.113.7"),
      );
      errorCode = response.errorCode;
    });

    expect(errorCode).toBeDefined();
    expect(elapsed).toBeLessThan(CUT_WITHIN_MS);
  });

  it("gives up a mail when the server never greets", async () => {
    const mail = new MailServiceImpl({
      host: "127.0.0.1",
      port: silent.port,
      user: "user",
      password: "password",
      from: '"VariaMos" <noreply@example.com>',
      production: true,
      timeouts: {
        connectionMs: LIMIT_MS,
        greetingMs: LIMIT_MS,
        socketMs: LIMIT_MS * 2,
      },
    });
    let sent: boolean | undefined;

    const elapsed = await elapsedMs(async () => {
      sent = await mail.sendMail("alice@example.com", "Subject", "<p>Hi</p>");
    });

    expect(sent).toBe(false);
    expect(elapsed).toBeLessThan(CUT_WITHIN_MS);
  });
});
