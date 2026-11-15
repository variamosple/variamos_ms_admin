import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { Permission } from "./Permission.js";
import { PermissionName } from "./PermissionName.js";

describe("PermissionName (EV-24)", () => {
  it("accepts a resource and an action, with or without a scope", () => {
    expect(new PermissionName("roles::read").getValue()).toBe("roles::read");
    expect(new PermissionName("admin::roles::read").getValue()).toBe(
      "admin::roles::read",
    );
    expect(new PermissionName("my-account2::query").getValue()).toBe(
      "my-account2::query",
    );
  });

  it.each([
    "",
    "read",
    "roles:read",
    "Roles::read",
    "a::b::c::d",
    " roles::read",
    "roles::read ",
  ])("refuses %j with a typed error", (name) => {
    expect(PermissionName.isValid(name)).toBe(false);
    expect(() => new PermissionName(name)).toThrow(
      expect.objectContaining({ code: DomainErrorCodes.INVALID_INPUT }),
    );
    expect(() => new PermissionName(name)).toThrow(DomainError);
  });

  it("says nothing is valid for a missing name", () => {
    expect(PermissionName.isValid(null)).toBe(false);
    expect(PermissionName.isValid(undefined)).toBe(false);
  });

  it("is what a Permission is named by", () => {
    expect(() => new Permission(1, "read")).toThrow(DomainError);
  });
});
