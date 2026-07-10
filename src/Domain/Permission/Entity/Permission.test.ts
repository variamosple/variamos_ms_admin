import { Permission } from "./Permission";

describe("Permission Entity - Unit Tests", () => {
  it("should build a Permission successfully", () => {
    const permission1 = new Permission(1, "my-account::query");
    expect(permission1.id).toBe(1);
    expect(permission1.name).toBe("my-account::query");

    const permission2 = Permission.builder().setId(2).setName("languages::create").build();
    expect(permission2.id).toBe(2);
    expect(permission2.name).toBe("languages::create");
  });

  it("should throw an error for empty or invalid names", () => {
    const expectedError =
      "Permission name must follow the 'resource::action' format (e.g. 'resource::action').";
    expect(() => new Permission(1, "")).toThrow(expectedError);
    expect(() => new Permission(1, "   ")).toThrow(expectedError);
    expect(() => new Permission(1, "read")).toThrow(expectedError);
    expect(() => new Permission(1, "resource:action")).toThrow(expectedError);
  });
});
