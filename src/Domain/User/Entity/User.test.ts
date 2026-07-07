import { User } from "./User";

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
});
