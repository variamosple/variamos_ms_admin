import { Role } from "./Role";

describe("Role Entity - Unit Tests", () => {
  it("should build a Role successfully with valid names", () => {
    const role1 = new Role(1, "Admin");
    expect(role1.id).toBe(1);
    expect(role1.name).toBe("Admin");

    const role2 = Role.builder().setId(2).setName("Super admin").build();
    expect(role2.id).toBe(2);
    expect(role2.name).toBe("Super admin");
  });

  it("should throw an error for empty names or invalid formatting", () => {
    const expectedError =
      "Role name must start with an uppercase letter, and subsequent words must be lowercase.";
    expect(() => new Role(1, "")).toThrow(expectedError);
    expect(() => new Role(1, "   ")).toThrow(expectedError);
    expect(() => new Role(1, "admin")).toThrow(expectedError);
    expect(() => new Role(1, "Super Admin")).toThrow(expectedError);
    expect(() => new Role(1, "GUEST")).toThrow(expectedError);
  });
});
