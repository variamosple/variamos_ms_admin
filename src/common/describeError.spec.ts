import { describeError } from "./describeError.js";

describe("describeError", () => {
  it("keeps the stack of an error", () => {
    const error = new Error("Connection refused");

    const text = describeError(error);

    expect(text).toContain("Error: Connection refused");
    expect(text).toContain("describeError.spec");
  });

  it("never includes the SQL, parameters or values carried by the error", () => {
    const error = Object.assign(new Error("Validation error"), {
      sql: "SELECT * FROM users WHERE email = 'alice@example.com'",
      parameters: ["alice@example.com", "$2b$10$hash"],
      errors: [{ value: "alice@example.com" }],
      original: { detail: "Key (email)=(alice@example.com) already exists." },
    });

    const text = describeError(error);

    expect(text).toContain("Validation error");
    expect(text).not.toContain("alice@example.com");
    expect(text).not.toContain("$2b$10$hash");
  });

  it("adds the error code, from the error or its parent", () => {
    const own = Object.assign(new Error("Not found"), { code: "ENOENT" });
    const parent = Object.assign(new Error("Database error"), {
      parent: { code: "23505" },
    });

    expect(describeError(own)).toContain("code: ENOENT");
    expect(describeError(parent)).toContain("code: 23505");
  });

  it("falls back to name and message when there is no stack", () => {
    const error = new TypeError("Invalid URL");
    error.stack = undefined;

    expect(describeError(error)).toBe("TypeError: Invalid URL");
  });

  it("describes a thrown non-error value by its type only", () => {
    expect(describeError("secret-token-value")).toBe(
      "Non-error value thrown (string)",
    );
  });
});
