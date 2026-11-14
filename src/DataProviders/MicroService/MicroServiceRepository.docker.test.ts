import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { MicroServiceFilter } from "#src/Domain/MicroService/Entity/MicroServiceFilter.js";
import type { HealthLogStatistics } from "./HealthLogStatistics.js";
import { MicroServiceHealthLogModel } from "./MicroServiceHealthLogModel.js";
import {
  DOCKER_UNREACHABLE_MESSAGE,
  MicroServiceRepositoryImpl,
} from "./MicroServiceRepository.js";

const monitored = {
  Id: "id-ms_auth",
  Names: ["/ms_auth"],
  State: "running",
  Status: "Up 2 hours",
  Created: 1_700_000_000,
  Labels: {
    "variamos.service.monitored": "true",
    "variamos.service.name": "ms_auth",
  },
  NetworkSettings: { Networks: { net: { IPAddress: "172.19.0.7" } } },
};

/** A Docker that stops answering (EV-71): an error, not an empty list. */
describe("MicroServiceRepositoryImpl when Docker does not answer", () => {
  let repository: MicroServiceRepositoryImpl;
  let listContainers: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repository = new MicroServiceRepositoryImpl({
      docker: { socketPath: "/nonexistent/docker.sock" },
      statistics: {
        uptimeCounts: vi.fn().mockResolvedValue(new Map()),
        lastStatuses: vi.fn().mockResolvedValue(new Map()),
      } as unknown as HealthLogStatistics,
    });
    listContainers = vi.fn();
    (
      repository as unknown as {
        dockerConnection: { listContainers: typeof listContainers };
      }
    ).dockerConnection.listContainers = listContainers;
    vi.spyOn(MicroServiceHealthLogModel, "findOne").mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const unreachable = () =>
    listContainers.mockRejectedValue(new Error("connect ECONNREFUSED"));

  it("answers UNAVAILABLE for the list, with the reason", async () => {
    unreachable();

    const response = await repository.queryMicroServices(
      new RequestModel("tx", new MicroServiceFilter()),
    );

    expect(response.errorCode).toBe(DomainErrorCodes.UNAVAILABLE);
    expect(response.message).toBe(DOCKER_UNREACHABLE_MESSAGE);
    expect(response.data).toBeFalsy();
  });

  it("answers UNAVAILABLE for one service, not 'not found'", async () => {
    unreachable();

    const response = await repository.queryByName(
      new RequestModel("tx", "ms_auth"),
    );

    expect(response.errorCode).toBe(DomainErrorCodes.UNAVAILABLE);
    expect(response.message).toBe(DOCKER_UNREACHABLE_MESSAGE);
  });

  it("gives the health checks the last services found, without addresses", async () => {
    listContainers.mockResolvedValueOnce([monitored]);
    const found = await repository.discoverServiceDefinitions();
    expect(found.map((def) => def.containerIps)).toEqual([["172.19.0.7"]]);
    unreachable();

    const kept = await repository.discoverServiceDefinitions();

    expect(kept.map((def) => def.name)).toEqual(["ms_auth"]);
    // An address may belong to another container once Docker answers again
    expect(kept.map((def) => def.containerIps)).toEqual([[]]);
  });

  it("records why a DOWN service is down when the check knows it", async () => {
    const create = vi
      .spyOn(MicroServiceHealthLogModel, "create")
      .mockResolvedValue(undefined as never);

    await repository.recordHealthCheck({
      serviceName: "ms_auth",
      status: "DOWN",
      responseTimeMs: 12,
      errorMessage: "Answered as another service: ms_bugs",
    });
    await repository.recordHealthCheck({
      serviceName: "ms_auth",
      status: "DOWN",
      responseTimeMs: 5000,
    });

    expect(create.mock.calls.map(([row]) => row?.errorMessage)).toEqual([
      "Answered as another service: ms_bugs",
      "Service unreachable or unhealthy",
    ]);
  });

  it("gives no service when Docker never answered", async () => {
    unreachable();

    await expect(repository.discoverServiceDefinitions()).resolves.toEqual([]);
  });
});

describe("MicroServiceRepositoryImpl container resources (EV-86 lot 2)", () => {
  const resources = {
    cpuPercent: 3.5,
    memoryUsedBytes: 150_000_000,
    memoryLimitBytes: 4_000_000_000,
    sampledAt: new Date("2026-11-14T10:00:00Z"),
  };
  const stopped = {
    ...monitored,
    Id: "id-ms_auth-old",
    Names: ["/ms_auth_old"],
    State: "exited",
  };

  const repositoryWith = (containers: unknown[]) => {
    const repository = new MicroServiceRepositoryImpl({
      docker: { socketPath: "/nonexistent/docker.sock" },
      statistics: {
        uptimeCounts: vi.fn().mockResolvedValue(new Map()),
        lastStatuses: vi.fn().mockResolvedValue(new Map()),
      } as unknown as HealthLogStatistics,
      // Values for any id: only a running container may show them
      resources: { resourcesOf: () => resources },
    });
    (
      repository as unknown as {
        dockerConnection: { listContainers: () => Promise<unknown[]> };
      }
    ).dockerConnection.listContainers = () => Promise.resolve(containers);
    vi.spyOn(MicroServiceHealthLogModel, "findOne").mockResolvedValue(null);
    return repository;
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives the CPU and memory of a running container only, in the list and the detail", async () => {
    const repository = repositoryWith([monitored, stopped]);

    const list = await repository.queryMicroServices(
      new RequestModel("tx", new MicroServiceFilter()),
    );
    const detail = await repository.queryByName(
      new RequestModel("tx", "ms_auth"),
    );

    for (const containers of [
      list.data?.[0]?.containers,
      detail.data?.containers,
    ]) {
      expect(containers?.map((c) => c.resources)).toEqual([
        resources,
        undefined,
      ]);
    }
  });
});
