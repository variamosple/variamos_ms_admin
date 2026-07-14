import { BugNote } from "./BugNote";

describe("BugNote Entity - Unit Tests", () => {
  it("should successfully build a BugNote using builder", () => {
    const author = { name: "John Writer" };
    const date = new Date();

    const note = BugNote.builder()
      .setId(42)
      .setBody("This is a note body")
      .setGitCommentId(999)
      .setBugId("bug-123")
      .setAuthorId("author-abc")
      .setCreatedAt(date)
      .setUpdatedAt(date)
      .setAuthor(author)
      .build();

    expect(note.id).toBe(42);
    expect(note.body).toBe("This is a note body");
    expect(note.gitCommentId).toBe(999);
    expect(note.bugId).toBe("bug-123");
    expect(note.authorId).toBe("author-abc");
    expect(note.createdAt).toBe(date);
    expect(note.updatedAt).toBe(date);
    expect(note.author).toBe(author);
  });
});
