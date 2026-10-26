import { mock } from "vitest-mock-extended";
import {
  Configuration,
  ConfigurationKey,
} from "#src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigEventPublisher } from "#src/Domain/Configuration/Event/IConfigEventPublisher.js";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { ConfigurationUseCase } from "#src/Domain/Configuration/UseCase/ConfigurationUseCase.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { SECRET_MASK } from "#src/Domain/Core/Secret/SecretMask.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import type { IUserMfaRepository } from "#src/Domain/Mfa/Repository/IUserMfaRepository.js";
import { MfaResetUseCase } from "#src/Domain/Mfa/UseCase/MfaResetUseCase.js";
import { Permission } from "#src/Domain/Permission/Entity/Permission.js";
import type { IPermissionRepository } from "#src/Domain/Permission/Repository/IPermissionRepository.js";
import { PermissionUseCase } from "#src/Domain/Permission/UseCase/PermissionUseCase.js";
import { Role } from "#src/Domain/Role/Entity/Role.js";
import { RolePermission } from "#src/Domain/Role/Entity/RolePermission.js";
import type { IRolePermissionRepository } from "#src/Domain/Role/Repository/IRolePermissionRepository.js";
import type { IRoleRepository } from "#src/Domain/Role/Repository/IRoleRepository.js";
import { RoleManagementUseCase } from "#src/Domain/Role/UseCase/RoleManagementUseCase.js";
import { RolePermissionUseCase } from "#src/Domain/Role/UseCase/RolePermissionUseCase.js";
import { User } from "#src/Domain/User/Entity/User.js";
import { UserRole } from "#src/Domain/User/Entity/UserRole.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";
import type { IUserRoleRepository } from "#src/Domain/User/Repository/IUserRoleRepository.js";
import { UserManagementUseCase } from "#src/Domain/User/UseCase/UserManagementUseCase.js";
import { UserPasswordUseCase } from "#src/Domain/User/UseCase/UserPasswordUseCase.js";
import { UserRoleUseCase } from "#src/Domain/User/UseCase/UserRoleUseCase.js";
import type { ActivityEntry } from "./ActivityEntry.js";

// Completeness of the activity journal (T-24, MA-AU-01): every
// administration operation of a use case records one entry, with its actor
const ADMIN = "admin-1";
const ok = <T>(data?: T) => {
  const response = new ResponseModel<T>("t");
  return data === undefined ? response : response.withResponse(data);
};

const journal = () => {
  const entries: ActivityEntry[] = [];
  return {
    entries,
    record: async (entry: ActivityEntry) => {
      entries.push(entry);
    },
  };
};
type Journal = ReturnType<typeof journal>;

const users = (j: Journal) => {
  const repo = mock<IUserRepository>();
  repo.enableUser.mockResolvedValue(ok());
  repo.disableUser.mockResolvedValue(ok());
  repo.deleteUser.mockResolvedValue(ok());
  return new UserManagementUseCase(repo, j, mock<ILogger>());
};
const roles = (j: Journal) => {
  const repo = mock<IRoleRepository>();
  repo.createRole.mockResolvedValue(ok(new Role(3, "Editor")));
  repo.updateRole.mockResolvedValue(ok(new Role(3, "Writer")));
  repo.deleteRole.mockResolvedValue(ok());
  repo.queryById.mockResolvedValue(ok(new Role(3, "Editor")));
  return new RoleManagementUseCase(repo, j);
};
const permissions = (j: Journal) => {
  const repo = mock<IPermissionRepository>();
  repo.createPermission.mockResolvedValue(ok(new Permission(5, "a::b")));
  repo.updatePermission.mockResolvedValue(ok(new Permission(5, "a::c")));
  repo.deletePermission.mockResolvedValue(ok());
  repo.queryById.mockResolvedValue(ok(new Permission(5, "a::b")));
  return new PermissionUseCase(repo, j);
};
const userRoles = (j: Journal) => {
  const repo = mock<IUserRoleRepository>();
  repo.createUserRole.mockResolvedValue(ok(new UserRole("user-2", 3)));
  repo.deleteUserRole.mockResolvedValue(ok());
  return new UserRoleUseCase(repo, j);
};
const rolePermissions = (j: Journal) => {
  const repo = mock<IRolePermissionRepository>();
  repo.createRolePermission.mockResolvedValue(ok(new RolePermission(3, 5)));
  repo.deleteRolePermission.mockResolvedValue(ok());
  return new RolePermissionUseCase(repo, j);
};
const configuration = (j: Journal, isSecret: boolean) => {
  const repo = mock<IConfigurationRepository>();
  const config = () =>
    Configuration.builder()
      .setKey(new ConfigurationKey("general.site_name"))
      .setValue("VariaMos")
      .setType("string")
      .setCategory("general")
      .setIsSecret(isSecret)
      .setTargetServices(["all"])
      .build();
  repo.queryByKey.mockResolvedValue(ok(config()));
  repo.updateConfiguration.mockResolvedValue(ok(config()));
  return new ConfigurationUseCase(repo, mock<IConfigEventPublisher>(), j);
};
const mfaReset = (j: Journal) => {
  const mfa = mock<IUserMfaRepository>();
  mfa.findByUser.mockResolvedValue({
    userId: "user-2",
    secretEncrypted: "v1:x",
    enabledAt: new Date(),
    lastUsedStep: 1,
  });
  const userRepo = mock<IUserRepository>();
  userRepo.queryById.mockResolvedValue(
    ok(
      User.builder()
        .setId("user-2")
        .setName("Bea")
        .setUser("bea")
        .setEmail("bea@example.com")
        .build(),
    ),
  );
  const mail = mock<IMailService>();
  mail.sendMfaResetMail.mockResolvedValue(true);
  return new MfaResetUseCase(mfa, userRepo, mail, j, mock<ILogger>());
};
const recoveryLink = (j: Journal) => {
  const userRepo = mock<IUserRepository>();
  // An unknown account: the answer stays silent, the attempt is recorded
  userRepo.queryById.mockResolvedValue(ok());
  return new UserPasswordUseCase(
    userRepo,
    mock<IMailService>(),
    { passwordResetExpiryInMs: 3_600_000, adminHomeUri: "http://ui" },
    j,
    mock<ILogger>(),
  );
};

const OPERATIONS: [
  string,
  (j: Journal) => Promise<unknown>,
  Partial<ActivityEntry>,
][] = [
  [
    "user.enable",
    (j) => users(j).enable(new RequestModel("t", "user-2", ADMIN)),
    { entityType: "user", entityId: "user-2" },
  ],
  [
    "user.disable",
    (j) => users(j).disable(new RequestModel("t", "user-2", ADMIN)),
    { entityType: "user", entityId: "user-2" },
  ],
  [
    "user.delete",
    (j) => users(j).delete(new RequestModel("t", "user-2", ADMIN)),
    { entityType: "user", entityId: "user-2" },
  ],
  [
    "user.recovery-link",
    (j) =>
      recoveryLink(j).generateLink(
        new RequestModel("t", { userId: "user-2", adminId: ADMIN }),
      ),
    { entityId: "user-2", after: { linkCreated: false } },
  ],
  [
    "user.mfa.reset",
    (j) => mfaReset(j).reset("t", "user-2", ADMIN),
    { entityId: "user-2", after: { mfaEnabled: false } },
  ],
  [
    "user.role.assign",
    (j) =>
      userRoles(j).createUserRole(
        new RequestModel("t", new UserRole("user-2", 3), ADMIN),
      ),
    { entityId: "user-2", after: { roleId: 3 } },
  ],
  [
    "user.role.remove",
    (j) =>
      userRoles(j).deleteUserRole(
        new RequestModel("t", new UserRole("user-2", 3), ADMIN),
      ),
    { entityId: "user-2", before: { roleId: 3 } },
  ],
  [
    "role.create",
    (j) =>
      roles(j).createRole(
        new RequestModel("t", new Role(null, "Editor"), ADMIN),
      ),
    { entityId: "3", after: { name: "Editor" } },
  ],
  [
    "role.update",
    (j) =>
      roles(j).updateRole(new RequestModel("t", new Role(3, "Writer"), ADMIN)),
    { entityId: "3", before: { name: "Editor" }, after: { name: "Writer" } },
  ],
  [
    "role.delete",
    (j) => roles(j).deleteRole(new RequestModel("t", "3", ADMIN)),
    { entityId: "3", before: { name: "Editor" } },
  ],
  [
    "role.permission.assign",
    (j) =>
      rolePermissions(j).createRolePermission(
        new RequestModel("t", new RolePermission(3, 5), ADMIN),
      ),
    { entityId: "3", after: { permissionId: 5 } },
  ],
  [
    "role.permission.remove",
    (j) =>
      rolePermissions(j).deleteRolePermission(
        new RequestModel("t", new RolePermission(3, 5), ADMIN),
      ),
    { entityId: "3", before: { permissionId: 5 } },
  ],
  [
    "permission.create",
    (j) =>
      permissions(j).createPermission(
        new RequestModel("t", new Permission(null, "a::b"), ADMIN),
      ),
    { entityId: "5", after: { name: "a::b" } },
  ],
  [
    "permission.update",
    (j) =>
      permissions(j).updatePermission(
        new RequestModel("t", new Permission(5, "a::c"), ADMIN),
      ),
    { entityId: "5", before: { name: "a::b" }, after: { name: "a::c" } },
  ],
  [
    "permission.delete",
    (j) => permissions(j).deletePermission(new RequestModel("t", 5, ADMIN)),
    { entityId: "5", before: { name: "a::b" } },
  ],
  [
    "configuration.update",
    (j) =>
      configuration(j, false).updateConfiguration(
        new RequestModel("t", {
          key: "general.site_name",
          value: "Other",
          operatorId: ADMIN,
        }),
      ),
    {
      entityId: "general.site_name",
      before: { value: "VariaMos" },
      after: { value: "Other" },
    },
  ],
];

describe("Activity journal of the administration operations", () => {
  it.each(OPERATIONS)(
    "%s records one entry with its actor",
    async (action, run, expected) => {
      const j = journal();

      await run(j);

      expect(j.entries).toHaveLength(1);
      expect(j.entries[0]).toMatchObject({
        actorId: ADMIN,
        action,
        outcome: "success",
        ...expected,
      });
    },
  );

  it("keeps a secret configuration as its mask, never in clear", async () => {
    const j = journal();

    await configuration(j, true).updateConfiguration(
      new RequestModel("t", {
        key: "general.site_name",
        value: "new-secret-value",
        operatorId: ADMIN,
      }),
    );

    expect(j.entries[0]).toMatchObject({
      before: { value: SECRET_MASK },
      after: { value: SECRET_MASK },
    });
    expect(JSON.stringify(j.entries)).not.toContain("new-secret-value");
  });

  it("records a refused operation, without stopping on the before value", async () => {
    const j = journal();
    const repo = mock<IRoleRepository>();
    repo.queryById.mockRejectedValue(new Error("database down"));
    repo.deleteRole.mockResolvedValue(
      new ResponseModel<void>("t").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Role not found.",
      ),
    );

    const response = await new RoleManagementUseCase(repo, j).deleteRole(
      new RequestModel("t", "3", ADMIN),
    );

    expect(response.errorCode).toBe("ENTITY_NOT_FOUND");
    expect(j.entries[0]).toMatchObject({
      action: "role.delete",
      outcome: "failed",
      errorCode: "ENTITY_NOT_FOUND",
      before: null,
    });
  });
});
