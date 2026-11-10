import { Role } from "./Role.js";

describe("Role Entity - Unit Tests", () => {
  it("should build a Role successfully with valid names", () => {
    const role1 = new Role(1, "Admin");
    expect(role1.id).toBe(1);
    expect(role1.name).toBe("Admin");

    const role2 = Role.builder().setId(2).setName("Super admin").build();
    expect(role2.id).toBe(2);
    expect(role2.name).toBe("Super admin");

    const role3 = new Role(3, "Product line designer");
    expect(role3.name).toBe("Product line designer");
  });

  it("should throw an error for empty names or invalid formatting", () => {
    const expectedError =
      "Role name must start with an uppercase letter, followed by lowercase words separated by single spaces (e.g. 'Test role').";
    expect(() => new Role(1, "")).toThrow(expectedError);
    expect(() => new Role(1, "   ")).toThrow(expectedError);
    expect(() => new Role(1, "admin")).toThrow(expectedError);
    expect(() => new Role(1, "GUEST")).toThrow(expectedError);
    // A capital on the first word only (EV-31)
    expect(() => new Role(1, "Super Admin")).toThrow(expectedError);
    expect(() => new Role(1, "Test  role")).toThrow(expectedError);
    expect(() => new Role(1, "Test role ")).toThrow(expectedError);
  });
});
