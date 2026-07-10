import EnvVars from "@src/common/EnvVars";
import { UserRepositoryImpl } from "./DataProviders/User/UserRepository";
import { MicroServiceRepositoryImpl } from "./DataProviders/MicroService/MicroServiceRepository";
import { RoleRepositoryImpl } from "./DataProviders/Role/RoleRepository";
import { RolePermissionRepositoryImpl } from "./DataProviders/Role/RolePermissionRepository";
import { UserRoleRepositoryImpl } from "./DataProviders/User/UserRoleRepository";
import { PermissionRepositoryImpl } from "./DataProviders/Permission/PermissionRepository";
import { VisitRepositoryImpl } from "./DataProviders/Visit/VisitRepository";
import { CountriesRepositoryImpl } from "./DataProviders/Countries/CountriesRepository";
import { MetricsRepositoryImpl } from "./DataProviders/Metrics/MetricsRepository";
import { BugRepositoryImpl } from "./DataProviders/Bug/BugRepository";

import { UsersUseCases } from "./Domain/User/UserUseCases";
import { BugUseCases } from "./Domain/Bug/BugUseCases";
import { MicroServiceUseCases } from "./Domain/MicroService/MicroServiceCases";
import { RolesUseCases } from "./Domain/Role/RoleUseCases";
import { RolePermissionUseCases } from "./Domain/Role/RolePermissionUseCases";
import { UserRoleUseCases } from "./Domain/User/UserRoleUseCases";
import { MetricsUseCases } from "./Domain/Metrics/MetricsUseCases";
import { PermissionsUseCases } from "./Domain/Permission/PermissionUseCases";
import { VisitsUseCases } from "./Domain/Visit/VisitUseCases";
import { CountriesUseCases } from "./Domain/Countries/CountriesUseCases";

import { MailServiceInstance } from "./Infrastructure/Mail/MailService";
import { GitHubIssuesServiceInstance } from "./Infrastructure/GitHub/GitHubIssuesService";
import { DiskStorageServiceInstance } from "./Infrastructure/Storage/DiskStorageService";

// Repositories
export const UserRepositoryInstance = new UserRepositoryImpl({
  bcryptSaltRounds: EnvVars.Auth.APP.BCRYPT_SALT_ROUNDS,
});

export const MicroServiceRepositoryInstance = new MicroServiceRepositoryImpl({
  socketPath: EnvVars.DOCKER.SOCKET_PATH,
});

export const RoleRepositoryInstance = new RoleRepositoryImpl();
export const RolePermissionRepositoryInstance = new RolePermissionRepositoryImpl();
export const UserRoleRepositoryInstance = new UserRoleRepositoryImpl();
export const PermissionRepositoryInstance = new PermissionRepositoryImpl();
export const VisitRepositoryInstance = new VisitRepositoryImpl();
export const CountriesRepositoryInstance = new CountriesRepositoryImpl();
export const MetricsRepositoryInstance = new MetricsRepositoryImpl();
export const BugRepositoryInstance = new BugRepositoryImpl();

// Use Cases
export const productionUsersUseCases = new UsersUseCases(
  UserRepositoryInstance,
  MailServiceInstance,
  RoleRepositoryInstance,
  {
    passwordResetExpiryInMs: EnvVars.Auth.APP.PASSWORD_RESET_EXPIRY_IN_MS,
    adminHomeUri: EnvVars.Auth.APP.ADMIN_HOME_URI,
  },
);

export const productionBugUseCases = new BugUseCases(
  GitHubIssuesServiceInstance,
  DiskStorageServiceInstance,
  BugRepositoryInstance,
  UserRepositoryInstance,
  {
    getGitHubToken: () => EnvVars.GITHUB.TOKEN,
    getGitHubManagedRepos: () => EnvVars.GITHUB.MANAGED_REPOS,
    getGitHubAppId: () => EnvVars.GITHUB.APP_ID,
    getGitHubPrivateKey: () => EnvVars.GITHUB.PRIVATE_KEY,
    getApiBaseUrl: () => EnvVars.ApiBaseUrl,
  },
);

export const productionMicroServiceUseCases = new MicroServiceUseCases(
  MicroServiceRepositoryInstance,
);

export const productionRolesUseCases = new RolesUseCases(RoleRepositoryInstance);

export const productionRolePermissionUseCases = new RolePermissionUseCases(
  RolePermissionRepositoryInstance,
);

export const productionUserRoleUseCases = new UserRoleUseCases(UserRoleRepositoryInstance);

export const productionMetricsUseCases = new MetricsUseCases(MetricsRepositoryInstance);

export const productionPermissionsUseCases = new PermissionsUseCases(PermissionRepositoryInstance);

export const productionVisitsUseCases = new VisitsUseCases(
  VisitRepositoryInstance,
  CountriesRepositoryInstance,
);

export const productionCountriesUseCases = new CountriesUseCases(CountriesRepositoryInstance);
