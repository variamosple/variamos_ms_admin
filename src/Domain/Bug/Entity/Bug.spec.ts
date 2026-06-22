import { Bug } from "./Bug";

describe("Bug Entity", () => {
  it("should successfully build a Bug entity using the builder", () => {
    const bug = Bug.builder().setId("bug-123").setTitle("Test Bug").build();

    expect(bug.id).toBe("bug-123");
    expect(bug.title).toBe("Test Bug");
  });

  describe("creatorName getter", () => {
    it("should return the name of the creator if createdBy is defined", () => {
      const bug = Bug.builder().setCreatedBy({ name: "John Doe" }).build();

      expect(bug.creatorName).toBe("John Doe");
    });

    it("should return 'Guest' if createdBy is not defined", () => {
      const bug = Bug.builder().build();

      expect(bug.creatorName).toBe("Guest");
    });
  });
});
