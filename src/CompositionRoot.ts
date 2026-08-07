import EnvVars from "@src/common/EnvVars.js";
import { BugRepositoryImpl } from "./DataProviders/Bug/BugRepository.js";
import { CountriesRepositoryImpl } from "./DataProviders/Countries/CountriesRepository.js";
import { MetricsRepositoryImpl } from "./DataProviders/Metrics/MetricsRepository.js";
import { MicroServiceRepositoryImpl } from "./DataProviders/MicroService/MicroServiceRepository.js";
import { PermissionRepositoryImpl } from "./DataProviders/Permission/PermissionRepository.js";
import { RolePermissionRepositoryImpl } from "./DataProviders/Role/RolePermissionRepository.js";
import { RoleRepositoryImpl } from "./DataProviders/Role/RoleRepository.js";
import { UserRepositoryImpl } from "./DataProviders/User/UserRepository.js";
import { UserRoleRepositoryImpl } from "./DataProviders/User/UserRoleRepository.js";
import { VisitRepositoryImpl } from "./DataProviders/Visit/VisitRepository.js";

// User Use Cases
import { UserAuthUseCase } from "./Domain/User/UseCase/UserAuthUseCase.js";
import { UserManagementUseCase } from "./Domain/User/UseCase/UserManagementUseCase.js";
import { UserPasswordUseCase } from "./Domain/User/UseCase/UserPasswordUseCase.js";
import { UserQueryUseCase } from "./Domain/User/UseCase/UserQueryUseCase.js";
import { UserRoleUseCase } from "./Domain/User/UseCase/UserRoleUseCase.js";

// Bug Use Cases
import { GitHubTokenResolver } from "./Domain/Bug/Service/GitHubTokenResolver.js";
import { BugAttachmentUseCase } from "./Domain/Bug/UseCase/BugAttachmentUseCase.js";
import { BugLifecycleUseCase } from "./Domain/Bug/UseCase/BugLifecycleUseCase.js";
import { BugQueryUseCase } from "./Domain/Bug/UseCase/BugQueryUseCase.js";
import { BugSubmissionUseCase } from "./Domain/Bug/UseCase/BugSubmissionUseCase.js";
import { BugSyncUseCase } from "./Domain/Bug/UseCase/BugSyncUseCase.js";

// Permission & Role Use Cases
import { PermissionUseCase } from "./Domain/Permission/UseCase/PermissionUseCase.js";
import { RoleManagementUseCase } from "./Domain/Role/UseCase/RoleManagementUseCase.js";
import { RolePermissionUseCase } from "./Domain/Role/UseCase/RolePermissionUseCase.js";
import { RoleQueryUseCase } from "./Domain/Role/UseCase/RoleQueryUseCase.js";

import { CountriesQueryUseCase } from "./Domain/Countries/UseCase/CountriesQueryUseCase.js";
// Other Use Cases
import { MetricsQueryUseCase } from "./Domain/Metrics/UseCase/MetricsQueryUseCase.js";
import { MicroServiceManagementUseCase } from "./Domain/MicroService/UseCase/MicroServiceManagementUseCase.js";
import { MicroServiceQueryUseCase } from "./Domain/MicroService/UseCase/MicroServiceQueryUseCase.js";
import { VisitUseCase } from "./Domain/Visit/UseCase/VisitUseCase.js";

import { GitHubIssuesServiceInstance } from "./Infrastructure/GitHub/GitHubIssuesService.js";
import { MailServiceInstance } from "./Infrastructure/Mail/MailService.js";
import { DiskStorageServiceInstance } from "./Infrastructure/Storage/DiskStorageService.js";

// Repositories
export const UserRepositoryInstance = new UserRepositoryImpl({
  bcryptSaltRounds: EnvVars.Auth.APP.BCRYPT_SALT_ROUNDS,
});

export const MicroServiceRepositoryInstance = new MicroServiceRepositoryImpl({
  socketPath: EnvVars.DOCKER.SOCKET_PATH,
});

export const RoleRepositoryInstance = new RoleRepositoryImpl();
export const RolePermissionRepositoryInstance =
  new RolePermissionRepositoryImpl();
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

export const productionUserManagementUseCase = new UserManagementUseCase(
  UserRepositoryInstance,
);

export const productionUserQueryUseCase = new UserQueryUseCase(
  UserRepositoryInstance,
);

export const productionUserRoleUseCase = new UserRoleUseCase(
  UserRoleRepositoryInstance,
);

// Bug Tracker Config
const bugTrackerConfig = {
  getGitHubToken: () => EnvVars.GITHUB.TOKEN,
  getGitHubManagedRepos: () => EnvVars.GITHUB.MANAGED_REPOS,
  getGitHubAppId: () => EnvVars.GITHUB.APP_ID,
  getGitHubPrivateKey: () => EnvVars.GITHUB.PRIVATE_KEY,
  getApiBaseUrl: () => EnvVars.ApiBaseUrl,
};

// GitHub Token Resolver
export const productionGitHubTokenResolver = new GitHubTokenResolver(
  bugTrackerConfig,
);

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
export const productionPermissionUseCase = new PermissionUseCase(
  PermissionRepositoryInstance,
);

export const productionRoleManagementUseCase = new RoleManagementUseCase(
  RoleRepositoryInstance,
);

export const productionRoleQueryUseCase = new RoleQueryUseCase(
  RoleRepositoryInstance,
);

export const productionRolePermissionUseCase = new RolePermissionUseCase(
  RolePermissionRepositoryInstance,
);

export const productionMetricsQueryUseCase = new MetricsQueryUseCase(
  MetricsRepositoryInstance,
);

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

export const productionMicroServiceManagementUseCase =
  new MicroServiceManagementUseCase(MicroServiceRepositoryInstance);
