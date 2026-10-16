import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { ConfigurationModel } from "../Configuration/Configuration.js";
import { MicroServiceAuditLogModel } from "./MicroServiceAuditLogModel.js";
import { MicroServiceRepositoryImpl } from "./MicroServiceRepository.js";

const SECRET_VALUE = "smtp-password-value";

// Plain stand-ins for Sequelize rows: only the fields the repository reads
const configRow = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  key: "notification.smtp.password",
  value: SECRET_VALUE,
  type: "string",
  isSecret: true,
  isReadOnly: false,
  requiresMfa: false,
  targetServices: ["variamos_ms_notifications"],
  description: "SMTP password",
  updatedBy: "admin@example.com",
  update: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const updateRequest = (value: string) =>
  new RequestModel("tx", {
    serviceName: "variamos_ms_notifications",
    key: "notification.smtp.password",
    value,
    operatorId: "operator@example.com",
  });

describe("MicroServiceRepositoryImpl configurations and secrets", () => {
  let repository: MicroServiceRepositoryImpl;

  beforeEach(() => {
    repository = new MicroServiceRepositoryImpl({
      socketPath: "/nonexistent/docker.sock",
    });
    vi.spyOn(MicroServiceAuditLogModel, "create").mockResolvedValue(
      {} as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      "a read-only configuration",
      { isReadOnly: true },
      "new",
      DomainErrorCodes.INVALID_INPUT,
    ],
    [
      "an MFA-protected configuration",
      { requiresMfa: true },
      "new",
      DomainErrorCodes.MFA_REQUIRED,
    ],
    [
      "the mask as a secret value",
      {},
      "********",
      DomainErrorCodes.INVALID_INPUT,
    ],
  ])(
    "refuses %s without writing anything",
    async (_label, overrides, value, code) => {
      const row = configRow(overrides);
      vi.spyOn(ConfigurationModel, "findOne").mockResolvedValue(row as never);

      const response = await repository.updateConfiguration(
        updateRequest(value),
      );

      expect(response.errorCode).toBe(code);
      expect(row.update).not.toHaveBeenCalled();
      expect(MicroServiceAuditLogModel.create).not.toHaveBeenCalled();
    },
  );

  it("updates a secret without writing it to the audit log or the response", async () => {
    const row = configRow();
    row.update.mockImplementation(async (changes: { value: string }) => {
      row.value = changes.value;
    });
    vi.spyOn(ConfigurationModel, "findOne").mockResolvedValue(row as never);

    const response = await repository.updateConfiguration(
      updateRequest("new-smtp-password"),
    );

    expect(response.errorCode).toBeUndefined();
    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({ value: "new-smtp-password" }),
    );
    expect(MicroServiceAuditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { key: "notification.smtp.password", newValue: "********" },
      }),
    );
    expect(JSON.stringify(response)).not.toContain("new-smtp-password");
  });

  it("never returns a secret value when listing configurations", async () => {
    vi.spyOn(ConfigurationModel, "findAll").mockResolvedValue([
      configRow(),
      configRow({
        key: "notification.smtp.port",
        value: "587",
        isSecret: false,
      }),
    ] as never);

    const response = await repository.queryConfigurations(
      new RequestModel("tx", "variamos_ms_notifications"),
    );

    const json = JSON.stringify(response);
    expect(json).not.toContain(SECRET_VALUE);
    expect(json).toContain('"value":"587"');
  });

  it("masks secret values stored in clear by older audit entries", async () => {
    vi.spyOn(MicroServiceAuditLogModel, "findAll").mockResolvedValue([
      {
        id: 1,
        serviceName: "variamos_ms_notifications",
        actionType: "CONFIG_UPDATE",
        details: { key: "notification.smtp.password", newValue: SECRET_VALUE },
        performedBy: "admin@example.com",
        createdAt: new Date(),
      },
      {
        id: 2,
        serviceName: "variamos_ms_notifications",
        actionType: "CONFIG_UPDATE",
        details: { key: "notification.smtp.port", newValue: "587" },
        performedBy: "admin@example.com",
        createdAt: new Date(),
      },
    ] as never);
    vi.spyOn(ConfigurationModel, "findAll").mockResolvedValue([
      { key: "notification.smtp.password" },
    ] as never);

    const response = await repository.queryAuditLogs(
      new RequestModel("tx", { serviceName: "variamos_ms_notifications" }),
    );

    const json = JSON.stringify(response);
    expect(json).not.toContain(SECRET_VALUE);
    expect(response.data?.[0]?.details.newValue).toBe("********");
    expect(response.data?.[1]?.details.newValue).toBe("587");
  });
});
