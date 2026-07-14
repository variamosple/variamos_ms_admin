import { Bug } from "./Bug";

describe("Bug Entity", () => {
  it("should successfully build a Bug entity using the builder", () => {
    const attachments = [{ id: 1, filePath: "/a.png", fileType: "image/png", bugId: "bug-123" }];
    const assignedAdmins = [{ id: "admin-1", name: "Admin One" }];

    const bug = Bug.builder()
      .setId("bug-123")
      .setTitle("Test Bug")
      .setDescription("Some description")
      .setPriority("low")
      .setCreatedById("user-cr")
      .setReporterEmail("reporter@ex.com")
      .setUpdatedById("user-up")
      .setUpdatedBy({ id: "user-up", name: "Updater" })
      .setAttachments(attachments)
      .setAssignedAdmins(assignedAdmins)
      .build();

    expect(bug.id).toBe("bug-123");
    expect(bug.title).toBe("Test Bug");
    expect(bug.priority).toBe("low");
    expect(bug.createdById).toBe("user-cr");
    expect(bug.reporterEmail).toBe("reporter@ex.com");
    expect(bug.updatedById).toBe("user-up");
    expect(bug.updatedBy?.name).toBe("Updater");
    expect(bug.attachments).toBe(attachments);
    expect(bug.assignedAdmins).toBe(assignedAdmins);
  });

  it("should throw an error for empty title", () => {
    expect(() => Bug.builder().setTitle("").build()).toThrow("Bug title cannot be empty.");
    expect(() => Bug.builder().setTitle("   ").build()).toThrow("Bug title cannot be empty.");
  });

  it("should throw an error for empty description", () => {
    expect(() => Bug.builder().setDescription("").build()).toThrow(
      "Bug description cannot be empty.",
    );
    expect(() => Bug.builder().setDescription("   ").build()).toThrow(
      "Bug description cannot be empty.",
    );
  });

  it("should throw an error for invalid priority", () => {
    const invalidPriority = "critical" as "low";
    expect(() => Bug.builder().setPriority(invalidPriority).build()).toThrow(
      "Bug priority must be either 'low', 'medium', or 'high'.",
    );
  });

  describe("creatorName getter", () => {
    it("should return the name of the creator if createdBy is defined", () => {
      const bug = Bug.builder().setCreatedBy({ id: "user-123", name: "John Doe" }).build();

      expect(bug.creatorName).toBe("John Doe");
    });

    it("should return 'Guest' if createdBy is not defined", () => {
      const bug = Bug.builder().build();

      expect(bug.creatorName).toBe("Guest");
    });
  });
});
