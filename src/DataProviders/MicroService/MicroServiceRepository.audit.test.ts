import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { MicroServiceAuditLogModel } from "./MicroServiceAuditLogModel.js";
import { MicroServiceHealthLogModel } from "./MicroServiceHealthLogModel.js";
import { MicroServiceRepositoryImpl } from "./MicroServiceRepository.js";

describe("MicroServiceRepositoryImpl audit actor", () => {
  const container = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
  };
  let repository: MicroServiceRepositoryImpl;

  beforeEach(() => {
    repository = new MicroServiceRepositoryImpl({
      socketPath: "/nonexistent/docker.sock",
    });
    // The container lookup talks to Docker: replace it with a fake container
    vi.spyOn(
      repository as unknown as { resolveContainer: () => unknown },
      "resolveContainer",
    ).mockResolvedValue(container);
    vi.spyOn(MicroServiceAuditLogModel, "create").mockResolvedValue(
      {} as never,
    );
    vi.spyOn(MicroServiceHealthLogModel, "create").mockResolvedValue(
      {} as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["startMicroService", "START"],
    ["stopMicroService", "STOP"],
    ["restartMicroService", "RESTART"],
  ] as const)(
    "%s records the caller, not a fixed name",
    async (method, action) => {
      const response = await repository[method](
        new RequestModel("tx", "variamos_ms_languages"),
        "operator@example.com",
      );

      expect(response.errorCode).toBeUndefined();
      expect(MicroServiceAuditLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: "variamos_ms_languages",
          actionType: action,
          performedBy: "operator@example.com",
        }),
      );
    },
  );
});
