import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { Email } from "./Email.js";
import { User } from "./User.js";

describe("User Entity & Builder - Unit Tests", () => {
  test("should build a User successfully using builder and constructor", () => {
    const createdAt = new Date();
    const lastLogin = new Date();
    const roles = ["admin"];
    const permissions = ["read"];

    const user = User.builder()
      .setId("user-123")
      .setUser("testuser")
      .setName("Test User")
      .setEmail("test@example.com")
      .setCountryCode("FR")
      .setCountryName("France")
      .setIsEnabled(true)
      .setIsDeleted(false)
      .setCreatedAt(createdAt)
      .setLastLogin(lastLogin)
      .setRoles(roles)
      .setPermissions(permissions)
      .build();

    expect(user.id).toBe("user-123");
    expect(user.user).toBe("testuser");
    expect(user.name).toBe("Test User");
    expect(user.email).toBe("test@example.com");
    expect(user.countryCode).toBe("FR");
    expect(user.countryName).toBe("France");
    expect(user.isEnabled).toBe(true);
    expect(user.isDeleted).toBe(false);
    expect(user.createdAt).toBe(createdAt);
    expect(user.lastLogin).toBe(lastLogin);
    expect(user.roles).toBe(roles);
    expect(user.permissions).toBe(permissions);

    // Verify build static method with builder
    const builder = User.builder()
      .setId("user-123")
      .setUser("testuser")
      .setName("Test User")
      .setEmail("test@example.com")
      .setCountryCode("FR")
      .setCountryName("France")
      .setIsEnabled(true)
      .setIsDeleted(false)
      .setCreatedAt(createdAt)
      .setLastLogin(lastLogin)
      .setRoles(roles)
      .setPermissions(permissions);

    const userFromStaticBuild = User.build(builder);
    expect(userFromStaticBuild.id).toBe("user-123");
    expect(userFromStaticBuild.user).toBe("testuser");

    // Verify all getter methods on builder itself
    expect(builder.getId()).toBe("user-123");
    expect(builder.getUser()).toBe("testuser");
    expect(builder.getName()).toBe("Test User");
    expect(builder.getEmail()).toBe("test@example.com");
    expect(builder.getCountryCode()).toBe("FR");
    expect(builder.getCountryName()).toBe("France");
    expect(builder.getIsEnabled()).toBe(true);
    expect(builder.getIsDeleted()).toBe(false);
    expect(builder.getCreatedAt()).toBe(createdAt);
    expect(builder.getLastLogin()).toBe(lastLogin);
    expect(builder.getRoles()).toBe(roles);
    expect(builder.getPermissions()).toBe(permissions);
  });

  test("should throw an error if name is empty or whitespaces", () => {
    const builder = User.builder()
      .setId("user-123")
      .setUser("testuser")
      .setName("   ")
      .setEmail("test@example.com")
      .setIsEnabled(true)
      .setIsDeleted(false)
      .setCreatedAt(new Date());

    expect(() => builder.build()).toThrow("Name is required.");
  });

  test("should validate email format in constructor", () => {
    const fields = {
      id: "user-123",
      user: "testuser",
      name: "Test User",
      email: "invalid-email",
      countryCode: null,
      countryName: null,
      isEnabled: true,
      isDeleted: false,
      createdAt: new Date(),
    };

    expect(() => new User(fields)).toThrow("Invalid email format.");
  });

  test("refuses a malformed address as soon as it is set (EV-24)", () => {
    expect(() => User.builder().setEmail("not-an-address")).toThrow(
      DomainError,
    );
  });

  test("keeps the address the builder normalized", () => {
    const user = User.builder()
      .setUser("ana")
      .setName("Ana")
      .setEmail("  Ana@Example.com ")
      .setIsEnabled(true)
      .setIsDeleted(false)
      .setCreatedAt(new Date())
      .build();

    expect(user.email).toBe(new Email("  Ana@Example.com ").getValue());
  });

  test("gives the roles and permissions on a new account, not the read one", () => {
    const user = User.builder()
      .setId("u1")
      .setUser("ana")
      .setName("Ana")
      .setEmail("ana@example.com")
      .setIsEnabled(true)
      .setIsDeleted(false)
      .setCreatedAt(new Date())
      .build();

    const withAccess = user.withAccess(["Admin"], ["admin::roles::read"]);

    expect(withAccess).not.toBe(user);
    expect(withAccess).toBeInstanceOf(User);
    expect(withAccess.roles).toEqual(["Admin"]);
    expect(withAccess.permissions).toEqual(["admin::roles::read"]);
    expect(withAccess.email).toBe("ana@example.com");
    expect(user.roles).toBeUndefined();
  });
});
