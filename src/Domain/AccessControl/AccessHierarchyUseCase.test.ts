import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { AccessCheck } from "./AccessCheck.js";
import { AccessHierarchyUseCase } from "./AccessHierarchyUseCase.js";
import type { IAccessHierarchyRepository } from "./IAccessHierarchyRepository.js";

/** Roles shaped like production: the top role does not include the others. */
const ROLES: Record<number, string[]> = {
  1: [
    "permissions::create",
    "roles::assign",
    "roles::update",
    "users::update",
    "users::delete",
  ],
  2: ["languages::publish::all", "product-line::create"],
  3: ["languages::get::public", "languages::query"],
  4: [
    "roles::assign",
    "users::update",
    "languages::get::public",
    "languages::query",
  ],
  5: ["permissions::create"],
};
const PERMISSION_NAMES: Record<number, string> = {
  10: "languages::query",
  11: "users::delete",
  12: "permissions::create",
};

function setup(
  accounts: Record<string, { roles: number[]; active?: boolean }>,
) {
  const repository: IAccessHierarchyRepository = {
    getAccountPermissions: async (userId) => {
      const account = accounts[userId];
      if (!account) return null;
      return {
        isActive: account.active ?? true,
        permissions: [...new Set(account.roles.flatMap((r) => ROLES[r] ?? []))],
      };
    },
    getRolePermissions: async (roleId) => ROLES[roleId] ?? null,
    getPermissionName: async (id) => PERMISSION_NAMES[id] ?? null,
    listActiveHolders: async (permission) =>
      Object.entries(accounts).flatMap(([userId, account]) =>
        account.active === false
          ? []
          : account.roles
              .filter((r) => ROLES[r]?.includes(permission))
              .map((roleId) => ({ userId, roleId })),
      ),
  };
  const useCase = new AccessHierarchyUseCase(repository);
  return async (operatorId: string | undefined, check: AccessCheck) =>
    (await useCase.authorize(operatorId, check)).errorCode;
}

const FORBIDDEN = DomainErrorCodes.FORBIDDEN;

describe("AccessHierarchyUseCase", () => {
  const accounts = {
    admin: { roles: [1] },
    admin2: { roles: [1] },
    manager: { roles: [4] },
    director: { roles: [2] },
    developer: { roles: [3] },
    disabledAdmin: { roles: [1], active: false },
  };
  const authorize = setup(accounts);

  describe("top accounts (permissions::create)", () => {
    it.each([2, 3, 4])(
      "assign role %i, even one they do not include",
      async (roleId) => {
        await expect(
          authorize("admin", {
            kind: "assign-role",
            userId: "developer",
            roleId,
          }),
        ).resolves.toBeUndefined();
      },
    );

    it("act on another top account (same rank)", async () => {
      await expect(
        authorize("admin", { kind: "disable-account", userId: "admin2" }),
      ).resolves.toBeUndefined();
      await expect(
        authorize("admin", { kind: "recovery-link", userId: "admin2" }),
      ).resolves.toBeUndefined();
      await expect(
        authorize("admin", { kind: "reset-mfa", userId: "admin2" }),
      ).resolves.toBeUndefined();
    });

    it("add any permission to a role, a new one included", async () => {
      await expect(
        authorize("admin", {
          kind: "add-permission",
          roleId: 1,
          permissionId: 10,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("accounts below the top", () => {
    it("assign a role included in theirs", async () => {
      await expect(
        authorize("manager", {
          kind: "assign-role",
          userId: "developer",
          roleId: 3,
        }),
      ).resolves.toBeUndefined();
    });

    it.each([
      ["a role with permissions they lack", 2],
      ["the top role", 1],
    ])("cannot assign %s", async (_label, roleId) => {
      await expect(
        authorize("manager", {
          kind: "assign-role",
          userId: "developer",
          roleId,
        }),
      ).resolves.toBe(FORBIDDEN);
    });

    it("cannot act on an account above them", async () => {
      await expect(
        authorize("manager", { kind: "recovery-link", userId: "admin" }),
      ).resolves.toBe(FORBIDDEN);
      await expect(
        authorize("manager", { kind: "reset-mfa", userId: "admin" }),
      ).resolves.toBe(FORBIDDEN);
      await expect(
        authorize("manager", { kind: "disable-account", userId: "director" }),
      ).resolves.toBe(FORBIDDEN);
    });

    it("cannot assign or remove a role on an account above them", async () => {
      for (const kind of ["assign-role", "remove-role"] as const) {
        await expect(
          authorize("manager", { kind, userId: "admin", roleId: 3 }),
        ).resolves.toBe(FORBIDDEN);
      }
    });

    it("cannot add to a role a permission they do not hold", async () => {
      await expect(
        authorize("manager", {
          kind: "add-permission",
          roleId: 4,
          permissionId: 11,
        }),
      ).resolves.toBe(FORBIDDEN);
      await expect(
        authorize("manager", {
          kind: "add-permission",
          roleId: 3,
          permissionId: 10,
        }),
      ).resolves.toBeUndefined();
    });

    it("cannot change or delete a role above them", async () => {
      await expect(
        authorize("manager", { kind: "update-role", roleId: 1 }),
      ).resolves.toBe(FORBIDDEN);
      await expect(
        authorize("manager", { kind: "delete-role", roleId: 2 }),
      ).resolves.toBe(FORBIDDEN);
    });
  });

  describe("own account", () => {
    it.each<AccessCheck["kind"]>(["assign-role", "remove-role"])(
      "%s on oneself is refused, top included",
      async (kind) => {
        await expect(
          authorize("admin", {
            kind,
            userId: "admin",
            roleId: 3,
          } as AccessCheck),
        ).resolves.toBe(FORBIDDEN);
      },
    );

    it.each<AccessCheck["kind"]>([
      "disable-account",
      "delete-account",
      "reset-mfa",
    ])("%s on oneself is refused", async (kind) => {
      await expect(
        authorize("admin", { kind, userId: "admin" } as AccessCheck),
      ).resolves.toBe(FORBIDDEN);
    });
  });

  describe("last active top account", () => {
    it.each<[string, AccessCheck]>([
      [
        "removing the top permission from the top role",
        { kind: "remove-permission", roleId: 1, permissionId: 12 },
      ],
      ["deleting the top role", { kind: "delete-role", roleId: 1 }],
    ])("is protected against %s", async (_label, check) => {
      await expect(authorize("admin", check)).resolves.toBe(FORBIDDEN);
    });

    it.each<[string, AccessCheck]>([
      [
        "removing the top permission",
        { kind: "remove-permission", roleId: 1, permissionId: 12 },
      ],
      ["deleting the top role", { kind: "delete-role", roleId: 1 }],
    ])(
      "allows %s while another role keeps an active top account",
      async (_label, check) => {
        const twoTopRoles = setup({
          admin: { roles: [1] },
          keeper: { roles: [5] },
        });

        await expect(twoTopRoles("admin", check)).resolves.toBeUndefined();
      },
    );

    it.each<[string, AccessCheck]>([
      ["updating the top role", { kind: "update-role", roleId: 1 }],
      [
        "removing another permission from it",
        { kind: "remove-permission", roleId: 1, permissionId: 11 },
      ],
    ])("does not block %s", async (_label, check) => {
      await expect(authorize("admin", check)).resolves.toBeUndefined();
    });

    it("does not count a disabled account as remaining", async () => {
      const keeperDisabled = setup({
        admin: { roles: [1] },
        keeper: { roles: [5], active: false },
      });

      await expect(
        keeperDisabled("admin", { kind: "delete-role", roleId: 1 }),
      ).resolves.toBe(FORBIDDEN);
    });
  });

  describe("operator", () => {
    it.each([
      ["no session user", undefined],
      ["an unknown account", "ghost"],
      ["a disabled account", "disabledAdmin"],
    ])("is refused for %s", async (_label, operatorId) => {
      await expect(
        authorize(operatorId, {
          kind: "assign-role",
          userId: "developer",
          roleId: 3,
        }),
      ).resolves.toBe(FORBIDDEN);
    });
  });
});
