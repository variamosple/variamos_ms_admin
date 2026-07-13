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

// User Use Cases
import { UserAuthUseCase } from "./Domain/User/UseCase/UserAuthUseCase";
import { UserPasswordUseCase } from "./Domain/User/UseCase/UserPasswordUseCase";
import { UserManagementUseCase } from "./Domain/User/UseCase/UserManagementUseCase";
import { UserQueryUseCase } from "./Domain/User/UseCase/UserQueryUseCase";
import { UserRoleUseCase } from "./Domain/User/UseCase/UserRoleUseCase";

// Bug Use Cases
import { GitHubTokenResolver } from "./Domain/Bug/Service/GitHubTokenResolver";
import { BugSubmissionUseCase } from "./Domain/Bug/UseCase/BugSubmissionUseCase";
import { BugLifecycleUseCase } from "./Domain/Bug/UseCase/BugLifecycleUseCase";
import { BugSyncUseCase } from "./Domain/Bug/UseCase/BugSyncUseCase";
import { BugQueryUseCase } from "./Domain/Bug/UseCase/BugQueryUseCase";
import { BugAttachmentUseCase } from "./Domain/Bug/UseCase/BugAttachmentUseCase";

// Permission & Role Use Cases
import { PermissionUseCase } from "./Domain/Permission/UseCase/PermissionUseCase";
import { RoleManagementUseCase } from "./Domain/Role/UseCase/RoleManagementUseCase";
import { RoleQueryUseCase } from "./Domain/Role/UseCase/RoleQueryUseCase";
import { RolePermissionUseCase } from "./Domain/Role/UseCase/RolePermissionUseCase";

// Other Use Cases
import { MetricsQueryUseCase } from "./Domain/Metrics/UseCase/MetricsQueryUseCase";
import { VisitUseCase } from "./Domain/Visit/UseCase/VisitUseCase";
import { CountriesQueryUseCase } from "./Domain/Countries/UseCase/CountriesQueryUseCase";
import { MicroServiceQueryUseCase } from "./Domain/MicroService/UseCase/MicroServiceQueryUseCase";
import { MicroServiceManagementUseCase } from "./Domain/MicroService/UseCase/MicroServiceManagementUseCase";

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

// User Use Case Instantiations
export const productionUserAuthUseCase = new UserAuthUseCase(
  UserRepositoryInstance,
  RoleRepositoryInstance,
);

export const productionUserPasswordUseCase = new UserPasswordUseCase(
  UserRepositoryInstance,
  MailServiceInstance,
  {
    passwordResetExpiryInMs: EnvVars.Auth.APP.PASSWORD_RESET_EXPIRY_IN_MS,
    adminHomeUri: EnvVars.Auth.APP.ADMIN_HOME_URI,
  },
);

export const productionUserManagementUseCase = new UserManagementUseCase(UserRepositoryInstance);

export const productionUserQueryUseCase = new UserQueryUseCase(UserRepositoryInstance);

export const productionUserRoleUseCase = new UserRoleUseCase(UserRoleRepositoryInstance);

// Bug Tracker Config
const bugTrackerConfig = {
  getGitHubToken: () => EnvVars.GITHUB.TOKEN,
  getGitHubManagedRepos: () => EnvVars.GITHUB.MANAGED_REPOS,
  getGitHubAppId: () => EnvVars.GITHUB.APP_ID,
  getGitHubPrivateKey: () => EnvVars.GITHUB.PRIVATE_KEY,
  getApiBaseUrl: () => EnvVars.ApiBaseUrl,
};

// GitHub Token Resolver
export const productionGitHubTokenResolver = new GitHubTokenResolver(bugTrackerConfig);

// Bug Use Case Instantiations
export const productionBugSubmissionUseCase = new BugSubmissionUseCase(
  BugRepositoryInstance,
  UserRepositoryInstance,
  GitHubIssuesServiceInstance,
  bugTrackerConfig,
  productionGitHubTokenResolver,
);

export const productionBugLifecycleUseCase = new BugLifecycleUseCase(
  BugRepositoryInstance,
  GitHubIssuesServiceInstance,
  DiskStorageServiceInstance,
  bugTrackerConfig,
  productionGitHubTokenResolver,
);

export const productionBugSyncUseCase = new BugSyncUseCase(
  BugRepositoryInstance,
  GitHubIssuesServiceInstance,
  bugTrackerConfig,
  productionGitHubTokenResolver,
);

export const productionBugQueryUseCase = new BugQueryUseCase(
  BugRepositoryInstance,
  bugTrackerConfig,
);

export const productionBugAttachmentUseCase = new BugAttachmentUseCase(
  BugRepositoryInstance,
  DiskStorageServiceInstance,
);

// Other Use Case Instantiations
export const productionPermissionUseCase = new PermissionUseCase(PermissionRepositoryInstance);

export const productionRoleManagementUseCase = new RoleManagementUseCase(RoleRepositoryInstance);

export const productionRoleQueryUseCase = new RoleQueryUseCase(RoleRepositoryInstance);

export const productionRolePermissionUseCase = new RolePermissionUseCase(
  RolePermissionRepositoryInstance,
);

export const productionMetricsQueryUseCase = new MetricsQueryUseCase(MetricsRepositoryInstance);

export const productionVisitUseCase = new VisitUseCase(
  VisitRepositoryInstance,
  CountriesRepositoryInstance,
);

export const productionCountriesQueryUseCase = new CountriesQueryUseCase(
  CountriesRepositoryInstance,
);

export const productionMicroServiceQueryUseCase = new MicroServiceQueryUseCase(
  MicroServiceRepositoryInstance,
);

export const productionMicroServiceManagementUseCase = new MicroServiceManagementUseCase(
  MicroServiceRepositoryInstance,
);
