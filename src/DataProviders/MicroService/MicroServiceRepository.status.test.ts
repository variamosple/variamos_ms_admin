import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { AesGcmSecretCipher } from "#src/Infrastructure/Security/AesGcmSecretCipher.js";
import { SecretConfigurationValue } from "../Configuration/SecretConfigurationValue.js";
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
    vi.spyOn(MicroServiceHealthLogModel, "findAll").mockResolvedValue([]);
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
