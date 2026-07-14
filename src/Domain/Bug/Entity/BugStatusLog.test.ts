import { BugStatusLog } from "./BugStatusLog";

describe("BugStatusLog Entity - Unit Tests", () => {
  it("should successfully build a BugStatusLog using builder", () => {
    const userRef = { id: "user-123", name: "User One", email: "user1@ex.com" };
    const date = new Date();

    const log = BugStatusLog.builder()
      .setId(101)
      .setStatus("closed")
      .setComment("Status changed to closed")
      .setChangedAt(date)
      .setBugId("bug-456")
      .setChangedById("user-123")
      .setChangedBy(userRef)
      .build();

    expect(log.id).toBe(101);
    expect(log.status).toBe("closed");
    expect(log.comment).toBe("Status changed to closed");
    expect(log.changedAt).toBe(date);
    expect(log.bugId).toBe("bug-456");
    expect(log.changedById).toBe("user-123");
    expect(log.changedBy).toBe(userRef);
  });
});
