import http from "node:http";
import type { AddressInfo } from "node:net";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { CountriesRepositoryImpl } from "./CountriesRepository.js";
import { IpCountryCache } from "./IpCountryCache.js";

vi.mock("#src/common/logger.js");

/** A geolocation service that counts its calls; /503 paths fail. */
async function startService() {
  const calls: string[] = [];
  const server = http.createServer((req, res) => {
    calls.push(req.url ?? "");
    if (req.url?.startsWith("/198.51.100.")) {
      res.writeHead(503).end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ location: { country_code: "CO" } }));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return { server, calls, url: `http://127.0.0.1:${port}` };
}

let service: Awaited<ReturnType<typeof startService>>;
beforeAll(async () => {
  service = await startService();
});
beforeEach(() => {
  service.calls.length = 0;
});
afterAll(() => {
  service.server.close();
});

const repositoryOf = () =>
  new CountriesRepositoryImpl(
    { baseUrl: service.url, timeoutMs: 2000 },
    new IpCountryCache(),
  );
const countryOf = (repository: CountriesRepositoryImpl, address: string) =>
  repository.getIpCountryCode(new RequestModel("t", address));

describe("country of an address (ADM-N26)", () => {
  it("asks the service once per address", async () => {
    const repository = repositoryOf();

    const first = await countryOf(repository, "203.0.113.7");
    const second = await countryOf(repository, "::ffff:203.0.113.7");
    await countryOf(repository, "203.0.113.8");

    expect(first.data).toBe("CO");
    expect(second.data).toBe("CO");
    expect(service.calls).toEqual(["/203.0.113.7", "/203.0.113.8"]);
  });

  it("sends nothing for a private address", async () => {
    const response = await countryOf(repositoryOf(), "172.18.0.5");

    expect(response.data).toBeUndefined();
    expect(response.errorCode).toBeUndefined();
    expect(service.calls).toEqual([]);
  });

  it("keeps a failure, so that an outage is not asked at each visit", async () => {
    const repository = repositoryOf();

    const first = await countryOf(repository, "198.51.100.2");
    const second = await countryOf(repository, "198.51.100.2");

    expect(first.errorCode).toBeDefined();
    expect(first.data).toBeUndefined();
    expect(second.errorCode).toBeDefined();
    expect(service.calls).toEqual(["/198.51.100.2"]);
  });
});
