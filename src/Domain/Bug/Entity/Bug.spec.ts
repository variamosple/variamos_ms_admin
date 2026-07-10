import { Bug } from "./Bug";

describe("Bug Entity", () => {
  it("should successfully build a Bug entity using the builder", () => {
    const bug = Bug.builder()
      .setId("bug-123")
      .setTitle("Test Bug")
      .setDescription("Some description")
      .setPriority("low")
      .build();

    expect(bug.id).toBe("bug-123");
    expect(bug.title).toBe("Test Bug");
    expect(bug.priority).toBe("low");
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
