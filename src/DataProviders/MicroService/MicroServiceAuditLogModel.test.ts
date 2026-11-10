import { MicroServiceAuditLogModel } from "./MicroServiceAuditLogModel.js";

describe("MicroServiceAuditLogModel", () => {
  it("reads the created_at column as createdAt, which the audit trail shows", () => {
    const attributes = MicroServiceAuditLogModel.getAttributes();

    expect(attributes.createdAt?.field).toBe("created_at");
  });

  it("gives the date of a row loaded from the database", () => {
    const row = MicroServiceAuditLogModel.build(
      {
        serviceName: "variamos_ms_languages",
        actionType: "RESTART",
        details: {},
        performedBy: "operator@example.com",
        createdAt: new Date("2026-10-28T20:00:00Z"),
      },
      { raw: true, isNewRecord: false },
    );

    expect(row.createdAt).toEqual(new Date("2026-10-28T20:00:00Z"));
  });
});
