import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { MicroServiceFilter } from "#src/Domain/MicroService/Entity/MicroServiceFilter.js";
import { AesGcmSecretCipher } from "#src/Infrastructure/Security/AesGcmSecretCipher.js";
import { SecretConfigurationValue } from "../Configuration/SecretConfigurationValue.js";
import type { HealthLogStatistics } from "./HealthLogStatistics.js";
import { MicroServiceHealthLogModel } from "./MicroServiceHealthLogModel.js";
import { MicroServiceRepositoryImpl } from "./MicroServiceRepository.js";

/** Status shown for one service (EV-106): no UP, time or date without a check. */
describe("MicroServiceRepositoryImpl.queryByName status", () => {
  let repository: MicroServiceRepositoryImpl;

  const runningContainer = {
    Id: "c1",
    Names: ["/ms_auth"],
    State: "running",
    Status: "Up 2 hours",
    Created: 1_700_000_000,
    Labels: {},
  };

  beforeEach(() => {
    repository = new MicroServiceRepositoryImpl({
      socketPath: "/nonexistent/docker.sock",
      secrets: new SecretConfigurationValue(new AesGcmSecretCipher(null)),
      // No check in the uptime period
      statistics: {
        uptimeCounts: vi.fn().mockResolvedValue(new Map()),
        lastStatuses: vi.fn().mockResolvedValue(new Map()),
      } as unknown as HealthLogStatistics,
    });
    // Discovery and Docker are replaced by one running container
    vi.spyOn(
      repository as unknown as { discoverServiceDefinitions: () => unknown },
      "discoverServiceDefinitions",
    ).mockResolvedValue([
      {
        name: "ms_auth",
        displayName: "Auth",
        targetUrl: "http://ms_auth:4000",
      },
    ]);
    vi.spyOn(
      (
        repository as unknown as {
          dockerConnection: { listContainers: () => unknown };
        }
      ).dockerConnection,
      "listContainers",
    ).mockResolvedValue([runningContainer]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const query = () => repository.queryByName(new RequestModel("tx", "ms_auth"));

  it("shows NO_DATA for a running container never checked", async () => {
    vi.spyOn(MicroServiceHealthLogModel, "findOne").mockResolvedValue(null);

    const { data, errorCode } = await query();

    expect(errorCode).toBeUndefined();
    expect(data?.health.status).toBe("NO_DATA");
    expect(data?.health.responseTimeMs).toBeUndefined();
    expect(data?.health.checkedAt).toBeUndefined();
    expect(data?.uptimeSummary?.currentStatus).toBe("NO_DATA");
    expect(data?.replicasCount).toBe(1);
  });

  it("shows the last persisted check of a running container", async () => {
    const checkedAt = new Date("2026-10-24T10:00:00Z");
    vi.spyOn(MicroServiceHealthLogModel, "findOne").mockResolvedValue({
      status: "DOWN",
      responseTimeMs: 812,
      checkedAt,
    } as never);

    const { data } = await query();

    expect(data?.health).toMatchObject({
      status: "DOWN",
      responseTimeMs: 812,
      checkedAt,
    });
  });
});

/** The list asks Docker and PostgreSQL once for all its services (EV-101). */
describe("MicroServiceRepositoryImpl.queryMicroServices", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists the containers once and reads the uptime of every service in one go", async () => {
    const container = (name: string) => ({
      Id: `id-${name}`,
      Names: [`/${name}`],
      State: "running",
      Status: "Up 2 hours",
      Created: 1_700_000_000,
      Labels: {
        "variamos.service.monitored": "true",
        "variamos.service.name": name,
      },
    });
    const uptimeCounts = vi.fn().mockResolvedValue(new Map());
    const repository = new MicroServiceRepositoryImpl({
      socketPath: "/nonexistent/docker.sock",
      secrets: new SecretConfigurationValue(new AesGcmSecretCipher(null)),
      statistics: {
        uptimeCounts,
        lastStatuses: vi.fn().mockResolvedValue(new Map()),
      } as unknown as HealthLogStatistics,
    });
    const listContainers = vi
      .spyOn(
        (
          repository as unknown as {
            dockerConnection: { listContainers: () => unknown };
          }
        ).dockerConnection,
        "listContainers",
      )
      .mockResolvedValue([container("ms_auth"), container("ms_bugs")]);
    vi.spyOn(MicroServiceHealthLogModel, "findOne").mockResolvedValue(null);

    const { data } = await repository.queryMicroServices(
      new RequestModel("tx", new MicroServiceFilter()),
    );

    expect(data?.map((service) => service.serviceName)).toEqual([
      "ms_auth",
      "ms_bugs",
    ]);
    expect(data?.map((service) => service.containers.length)).toEqual([1, 1]);
    expect(listContainers).toHaveBeenCalledTimes(1);
    expect(uptimeCounts).toHaveBeenCalledTimes(1);
    expect(uptimeCounts.mock.calls[0]?.[0]).toEqual(["ms_auth", "ms_bugs"]);
  });
});
