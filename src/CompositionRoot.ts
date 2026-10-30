import multer from "multer";
import EnvVars from "#src/common/EnvVars.js";
import logger from "#src/common/logger.js";
import { MAX_ATTACHMENT_SIZE_BYTES } from "#src/Domain/Core/File/AllowedFileType.js";
import { AccessHierarchyRepositoryImpl } from "./DataProviders/AccessControl/AccessHierarchyRepository.js";
import { SecurityAlertRecipientRepository } from "./DataProviders/AccessControl/SecurityAlertRecipientRepository.js";
import { AccessJournalRepositoryImpl } from "./DataProviders/Activity/AccessJournalRepository.js";
import { ActivityJournalRepositoryImpl } from "./DataProviders/Activity/ActivityJournalRepository.js";
import { JournalReaderRepositoryImpl } from "./DataProviders/Activity/JournalReaderRepository.js";
import { BugRepositoryImpl } from "./DataProviders/Bug/BugRepository.js";
import { ConfigurationRepositoryImpl } from "./DataProviders/Configuration/ConfigurationRepository.js";
import { SecretConfigurationValue } from "./DataProviders/Configuration/SecretConfigurationValue.js";
import { CountriesRepositoryImpl } from "./DataProviders/Countries/CountriesRepository.js";
import { MetricsRepositoryImpl } from "./DataProviders/Metrics/MetricsRepository.js";
import { TrustedDeviceRepositoryImpl } from "./DataProviders/Mfa/TrustedDeviceRepository.js";
import { UserMfaRepositoryImpl } from "./DataProviders/Mfa/UserMfaRepository.js";
import { HealthLogStatistics } from "./DataProviders/MicroService/HealthLogStatistics.js";
import { MicroServiceRepositoryImpl } from "./DataProviders/MicroService/MicroServiceRepository.js";
import { NotificationRecipientDirectory } from "./DataProviders/Notification/NotificationRecipientDirectory.js";
import { PermissionRepositoryImpl } from "./DataProviders/Permission/PermissionRepository.js";
import { RolePermissionRepositoryImpl } from "./DataProviders/Role/RolePermissionRepository.js";
import { RoleRepositoryImpl } from "./DataProviders/Role/RoleRepository.js";
import { UserRepositoryImpl } from "./DataProviders/User/UserRepository.js";
import { UserRoleRepositoryImpl } from "./DataProviders/User/UserRoleRepository.js";
import { VisitRepositoryImpl } from "./DataProviders/Visit/VisitRepository.js";
import {
  AccessHierarchyUseCase,
  TOP_PERMISSION,
} from "./Domain/AccessControl/AccessHierarchyUseCase.js";
import { JournalQueryUseCase } from "./Domain/Activity/JournalQueryUseCase.js";
import { SecurityAlertPolicyService } from "./Domain/Activity/SecurityAlertPolicyService.js";
import {
  SecurityAlertDetector,
  watchedAccessJournal,
  watchedActivityJournal,
} from "./Domain/Activity/SecurityAlerts.js";
import { bugSyncIntervalMsOf } from "./Domain/Bug/Entity/BugSchedule.js";
import {
  BugScheduleService,
  type IBugScheduleProvider,
} from "./Domain/Bug/Service/BugScheduleService.js";
// Bug Use Cases
import { BugAssignmentUseCase } from "./Domain/Bug/UseCase/BugAssignmentUseCase.js";
import { BugAttachmentUseCase } from "./Domain/Bug/UseCase/BugAttachmentUseCase.js";
import { BugLifecycleUseCase } from "./Domain/Bug/UseCase/BugLifecycleUseCase.js";
import { BugQueryUseCase } from "./Domain/Bug/UseCase/BugQueryUseCase.js";
import { BugSubmissionUseCase } from "./Domain/Bug/UseCase/BugSubmissionUseCase.js";
import { BugSyncUseCase } from "./Domain/Bug/UseCase/BugSyncUseCase.js";
import { ConfigurationUseCase } from "./Domain/Configuration/UseCase/ConfigurationUseCase.js";
import { RequestModel } from "./Domain/Core/Entity/RequestModel.js";
import { CountriesQueryUseCase } from "./Domain/Countries/UseCase/CountriesQueryUseCase.js";
// Other Use Cases
import { MetricsQueryUseCase } from "./Domain/Metrics/UseCase/MetricsQueryUseCase.js";
import { PendingMfaSignIns } from "./Domain/Mfa/Service/PendingMfaSignIns.js";
import { MfaResetUseCase } from "./Domain/Mfa/UseCase/MfaResetUseCase.js";
import { MfaSignInUseCase } from "./Domain/Mfa/UseCase/MfaSignInUseCase.js";
import { TrustedDeviceUseCase } from "./Domain/Mfa/UseCase/TrustedDeviceUseCase.js";
import { UserMfaUseCase } from "./Domain/Mfa/UseCase/UserMfaUseCase.js";
import { MicroServiceManagementUseCase } from "./Domain/MicroService/UseCase/MicroServiceManagementUseCase.js";
import { MicroServiceQueryUseCase } from "./Domain/MicroService/UseCase/MicroServiceQueryUseCase.js";
import { NotificationDispatchUseCase } from "./Domain/Notification/UseCase/NotificationDispatchUseCase.js";
// Permission & Role Use Cases
import { PermissionUseCase } from "./Domain/Permission/UseCase/PermissionUseCase.js";
import { RoleManagementUseCase } from "./Domain/Role/UseCase/RoleManagementUseCase.js";
import { RolePermissionUseCase } from "./Domain/Role/UseCase/RolePermissionUseCase.js";
import { RoleQueryUseCase } from "./Domain/Role/UseCase/RoleQueryUseCase.js";
import {
  AccountLockout,
  AccountLockoutPolicyService,
} from "./Domain/User/Service/AccountLockoutService.js";
import { PasswordHashingCostService } from "./Domain/User/Service/PasswordHashingCostService.js";
import { PasswordPolicyService } from "./Domain/User/Service/PasswordPolicyService.js";
// User Use Cases
import { UserAuthUseCase } from "./Domain/User/UseCase/UserAuthUseCase.js";
import { UserManagementUseCase } from "./Domain/User/UseCase/UserManagementUseCase.js";
import { UserPasswordUseCase } from "./Domain/User/UseCase/UserPasswordUseCase.js";
import { UserQueryUseCase } from "./Domain/User/UseCase/UserQueryUseCase.js";
import { UserRoleUseCase } from "./Domain/User/UseCase/UserRoleUseCase.js";
import { VisitUseCase } from "./Domain/Visit/UseCase/VisitUseCase.js";
import type { BaseRouterDependencies } from "./EntryPoints/index.js";
import { GitHubIssuesServiceInstance } from "./Infrastructure/GitHub/GitHubIssuesService.js";
import { GitHubTokenResolver } from "./Infrastructure/GitHub/GitHubTokenResolver.js";
import { HealthCheckCollector } from "./Infrastructure/Health/HealthCheckCollector.js";
import { JetLogger } from "./Infrastructure/Logging/JetLogger.js";
import { MailServiceInstance } from "./Infrastructure/Mail/MailService.js";
import { ConfigEventPublisherImpl } from "./Infrastructure/Messaging/ConfigEventPublisher.js";
import { BugAssignmentNotifier } from "./Infrastructure/Notification/BugAssignmentNotifier.js";
import { NotificationAccessTokenIssuer } from "./Infrastructure/Notification/NotificationAccessTokenIssuer.js";
import { NotificationClientInstance } from "./Infrastructure/Notification/NotificationClient.js";
import { SecurityAlertNotifier } from "./Infrastructure/Notification/SecurityAlertNotifier.js";
import {
  followBugSyncInterval,
  followHealthCheckInterval,
} from "./Infrastructure/Scheduling/BackgroundJobs.js";
import { RepeatingTask } from "./Infrastructure/Scheduling/RepeatingTask.js";
import {
  AesGcmSecretCipher,
  parseEncryptionKey,
} from "./Infrastructure/Security/AesGcmSecretCipher.js";
import { BcryptPasswordHasher } from "./Infrastructure/Security/BcryptPasswordHasher.js";
import { DiskStorageServiceInstance } from "./Infrastructure/Storage/DiskStorageService.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "./Infrastructure/VariamosORM.js";

// Secret configurations are encrypted at rest (T-13, EV-78 lot 2); without
// a valid key they cannot be changed
const configEncryptionKey = parseEncryptionKey(
  EnvVars.Auth.APP.CONFIG_ENCRYPTION_KEY,
);
if (!configEncryptionKey && EnvVars.Auth.APP.CONFIG_ENCRYPTION_KEY.trim()) {
  logger.warn(
    "[CONFIG] CONFIG_ENCRYPTION_KEY is not 32 bytes in base64: secret configurations cannot be changed",
  );
}
export const SecretConfigurationValueInstance = new SecretConfigurationValue(
  new AesGcmSecretCipher(configEncryptionKey),
);

// Repositories
// Health check statistics and retention, read by the screens and the collector
const HealthLogStatisticsInstance = new HealthLogStatistics(
  VARIAMOS_ORM,
  DB_SCHEMA,
);

const MicroServiceRepositoryInstance = new MicroServiceRepositoryImpl({
  socketPath: EnvVars.DOCKER.SOCKET_PATH,
  secrets: SecretConfigurationValueInstance,
  statistics: HealthLogStatisticsInstance,
});

const RoleRepositoryInstance = new RoleRepositoryImpl();
const RolePermissionRepositoryInstance = new RolePermissionRepositoryImpl();
const UserRoleRepositoryInstance = new UserRoleRepositoryImpl();
const PermissionRepositoryInstance = new PermissionRepositoryImpl();
const VisitRepositoryInstance = new VisitRepositoryImpl();
const CountriesRepositoryInstance = new CountriesRepositoryImpl();
const MetricsRepositoryInstance = new MetricsRepositoryImpl();
const BugRepositoryInstance = new BugRepositoryImpl();
const ConfigurationRepositoryInstance = new ConfigurationRepositoryImpl(
  SecretConfigurationValueInstance,
);
// security.bcrypt_salt_rounds, read at each hash; BCRYPT_SALT_ROUNDS as fallback
const UserRepositoryInstance = new UserRepositoryImpl(
  new BcryptPasswordHasher(
    new PasswordHashingCostService(
      ConfigurationRepositoryInstance,
      EnvVars.Auth.APP.BCRYPT_SALT_ROUNDS,
    ),
  ),
);
const ConfigEventPublisherInstance = new ConfigEventPublisherImpl();
// Administration operations (T-24): table admin_activity_logs, append-only
export const ActivityJournalInstance = new ActivityJournalRepositoryImpl(
  VARIAMOS_ORM,
  DB_SCHEMA,
);
// Sign-ins, locks and refused requests (T-24): table admin_access_logs
export const AccessJournalInstance = new AccessJournalRepositoryImpl(
  VARIAMOS_ORM,
  DB_SCHEMA,
);
// Security alerts (T-24, EV-88 lot D): both journals are watched; alerts go
// to the accounts holding the top permission, in the app and by mail
const SecurityAlertDetectorInstance = new SecurityAlertDetector(
  new SecurityAlertPolicyService(ConfigurationRepositoryInstance, JetLogger),
  new SecurityAlertRecipientRepository(TOP_PERMISSION),
  new SecurityAlertNotifier(
    NotificationClientInstance,
    MailServiceInstance,
    JetLogger,
  ),
  ActivityJournalInstance,
  JetLogger,
);
const WatchedActivityJournal = watchedActivityJournal(
  ActivityJournalInstance,
  SecurityAlertDetectorInstance,
);
const WatchedAccessJournal = watchedAccessJournal(
  AccessJournalInstance,
  SecurityAlertDetectorInstance,
);
// Read-only pages of both journals (T-24 lot 3)
const productionJournalQueryUseCase = new JournalQueryUseCase(
  new JournalReaderRepositoryImpl(VARIAMOS_ORM, DB_SCHEMA),
);

// Configuration Use Case Instantiations
export const productionConfigurationUseCase = new ConfigurationUseCase(
  ConfigurationRepositoryInstance,
  ConfigEventPublisherInstance,
  WatchedActivityJournal,
);

// User Use Case Instantiations
// security.password.* keys, read at each sign-up, change and reset
const PasswordPolicyServiceInstance = new PasswordPolicyService(
  ConfigurationRepositoryInstance,
  JetLogger,
);

// security.lockout.* keys, read at each sign-in
const AccountLockoutInstance = new AccountLockout(
  new AccountLockoutPolicyService(ConfigurationRepositoryInstance, JetLogger),
);

const productionUserAuthUseCase = new UserAuthUseCase(
  UserRepositoryInstance,
  RoleRepositoryInstance,
  JetLogger,
  MailServiceInstance,
  { adminHomeUri: EnvVars.Auth.APP.ADMIN_HOME_URI },
  PasswordPolicyServiceInstance,
);

const productionUserPasswordUseCase = new UserPasswordUseCase(
  UserRepositoryInstance,
  MailServiceInstance,
  {
    passwordResetExpiryInMs: EnvVars.Auth.APP.PASSWORD_RESET_EXPIRY_IN_MS,
    adminHomeUri: EnvVars.Auth.APP.ADMIN_HOME_URI,
  },
  WatchedActivityJournal,
  JetLogger,
  PasswordPolicyServiceInstance,
);

const productionUserManagementUseCase = new UserManagementUseCase(
  UserRepositoryInstance,
  WatchedActivityJournal,
  JetLogger,
  PasswordPolicyServiceInstance,
);

// Two-factor authentication (SPC-2026-10-17-001); off without a valid key
const mfaEncryptionKey = parseEncryptionKey(
  EnvVars.Auth.APP.MFA_ENCRYPTION_KEY,
);
if (!mfaEncryptionKey && EnvVars.Auth.APP.MFA_ENCRYPTION_KEY.trim()) {
  logger.warn(
    "[MFA] MFA_ENCRYPTION_KEY is not 32 bytes in base64: two-factor enrollment is unavailable",
  );
}
const userMfaRepository = new UserMfaRepositoryImpl(VARIAMOS_ORM, DB_SCHEMA);
const mfaSecretCipher = new AesGcmSecretCipher(mfaEncryptionKey);
const productionUserMfaUseCase = new UserMfaUseCase(
  userMfaRepository,
  UserRepositoryInstance,
  mfaSecretCipher,
  JetLogger,
);
// Browsers where the user chose not to be asked the code (lot 6)
const productionTrustedDeviceUseCase = new TrustedDeviceUseCase(
  new TrustedDeviceRepositoryImpl(VARIAMOS_ORM, DB_SCHEMA),
  ConfigurationRepositoryInstance,
  JetLogger,
);
// The code asked after the password, for accounts with a second factor
const productionMfaSignInUseCase = new MfaSignInUseCase(
  userMfaRepository,
  productionUserMfaUseCase,
  mfaSecretCipher,
  new PendingMfaSignIns(),
  productionTrustedDeviceUseCase,
  JetLogger,
);
// An administrator turns off the second factor of an account that lost it
const productionMfaResetUseCase = new MfaResetUseCase(
  userMfaRepository,
  UserRepositoryInstance,
  MailServiceInstance,
  WatchedActivityJournal,
  JetLogger,
);

const productionUserQueryUseCase = new UserQueryUseCase(UserRepositoryInstance);

const productionUserRoleUseCase = new UserRoleUseCase(
  UserRoleRepositoryInstance,
  WatchedActivityJournal,
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
const productionGitHubTokenResolver = new GitHubTokenResolver(bugTrackerConfig);

// Bug Use Case Instantiations
const productionBugSubmissionUseCase = new BugSubmissionUseCase(
  BugRepositoryInstance,
  UserRepositoryInstance,
  GitHubIssuesServiceInstance,
  bugTrackerConfig,
  productionGitHubTokenResolver,
  DiskStorageServiceInstance,
);

// Bug tracker schedule, read from the configuration screen (EV-18)
const BugScheduleServiceInstance = new BugScheduleService(
  ConfigurationRepositoryInstance,
);

export const productionBugLifecycleUseCase = new BugLifecycleUseCase(
  BugRepositoryInstance,
  GitHubIssuesServiceInstance,
  DiskStorageServiceInstance,
  bugTrackerConfig,
  productionGitHubTokenResolver,
  WatchedActivityJournal,
  JetLogger,
  BugScheduleServiceInstance,
);

const productionBugSyncUseCase = new BugSyncUseCase(
  BugRepositoryInstance,
  GitHubIssuesServiceInstance,
  bugTrackerConfig,
  productionGitHubTokenResolver,
  JetLogger,
);

const productionBugQueryUseCase = new BugQueryUseCase(
  BugRepositoryInstance,
  bugTrackerConfig,
  JetLogger,
);

const productionBugAssignmentUseCase = new BugAssignmentUseCase(
  BugRepositoryInstance,
  new BugAssignmentNotifier(NotificationClientInstance),
  WatchedActivityJournal,
  JetLogger,
);

const productionBugAttachmentUseCase = new BugAttachmentUseCase(
  BugRepositoryInstance,
  DiskStorageServiceInstance,
  JetLogger,
);

// Notifications sent by an administrator (T-18 lot 3b)
const productionNotificationDispatchUseCase = new NotificationDispatchUseCase(
  new NotificationRecipientDirectory(),
  NotificationClientInstance,
  WatchedActivityJournal,
);

/** Resolves when the database answers, for GET /health. */
const checkDatabase = (): Promise<void> => VARIAMOS_ORM.authenticate();

// Other Use Case Instantiations
const productionPermissionUseCase = new PermissionUseCase(
  PermissionRepositoryInstance,
  WatchedActivityJournal,
);

const productionRoleManagementUseCase = new RoleManagementUseCase(
  RoleRepositoryInstance,
  WatchedActivityJournal,
);

const productionRoleQueryUseCase = new RoleQueryUseCase(RoleRepositoryInstance);

const productionRolePermissionUseCase = new RolePermissionUseCase(
  RolePermissionRepositoryInstance,
  WatchedActivityJournal,
);

const productionAccessHierarchyUseCase = new AccessHierarchyUseCase(
  new AccessHierarchyRepositoryImpl(),
);

const productionMetricsQueryUseCase = new MetricsQueryUseCase(
  MetricsRepositoryInstance,
);

const productionVisitUseCase = new VisitUseCase(
  VisitRepositoryInstance,
  CountriesRepositoryInstance,
);

const productionCountriesQueryUseCase = new CountriesQueryUseCase(
  CountriesRepositoryInstance,
);

export const productionMicroServiceQueryUseCase = new MicroServiceQueryUseCase(
  MicroServiceRepositoryInstance,
);

const productionMicroServiceManagementUseCase =
  new MicroServiceManagementUseCase(
    MicroServiceRepositoryInstance,
    JetLogger,
    ConfigurationRepositoryInstance,
    ConfigEventPublisherInstance,
    WatchedActivityJournal,
  );

// Short-lived tokens for the notification service (ADR-0001)
const productionNotificationAccessTokenIssuer =
  new NotificationAccessTokenIssuer(EnvVars.NOTIFICATION.INTERNAL_TOKEN);

// Uploads are kept in memory, within the size limit, until the use case has
// checked the request and the file type; only then is the file written, under
// a server-generated name (DiskStorageService).
const productionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES, files: 1 },
});

// Health checks of the services, started by the background jobs; the interval
// follows the configuration screen
export const HealthCheckCollectorInstance = new HealthCheckCollector(
  MicroServiceRepositoryInstance,
  HealthLogStatisticsInstance,
  EnvVars.MONITORING.HEALTH_CHECK_INTERVAL_MS,
);
MicroServiceRepositoryInstance.setHealthCollector(HealthCheckCollectorInstance);
ConfigEventPublisherInstance.addListener(
  followHealthCheckInterval(HealthCheckCollectorInstance),
);

// Bugs synchronization with GitHub, started by the background jobs at the
// configured interval; a change on the configuration screen moves it at once
export const BugSyncTask = new RepeatingTask(
  "Periodic bugs synchronization",
  () => productionBugSyncUseCase.syncBugs(new RequestModel("periodicSyncBugs")),
  bugSyncIntervalMsOf(undefined),
);
ConfigEventPublisherInstance.addListener(followBugSyncInterval(BugSyncTask));
export const productionBugSchedule: IBugScheduleProvider =
  BugScheduleServiceInstance;

// What the routers need (T-18 lot 4a)
export const productionRouterDependencies: BaseRouterDependencies = {
  users: {
    auth: productionUserAuthUseCase,
    password: productionUserPasswordUseCase,
    management: productionUserManagementUseCase,
    query: productionUserQueryUseCase,
    role: productionUserRoleUseCase,
  },
  bugs: {
    submission: productionBugSubmissionUseCase,
    lifecycle: productionBugLifecycleUseCase,
    sync: productionBugSyncUseCase,
    query: productionBugQueryUseCase,
    attachment: productionBugAttachmentUseCase,
    assignment: productionBugAssignmentUseCase,
  },
  microServices: {
    query: productionMicroServiceQueryUseCase,
    management: productionMicroServiceManagementUseCase,
  },
  roles: {
    management: productionRoleManagementUseCase,
    query: productionRoleQueryUseCase,
    permission: productionRolePermissionUseCase,
  },
  mfa: {
    user: productionUserMfaUseCase,
    signIn: productionMfaSignInUseCase,
    reset: productionMfaResetUseCase,
    trustedDevices: productionTrustedDeviceUseCase,
  },
  notifications: {
    accessTokenIssuer: productionNotificationAccessTokenIssuer,
    dispatch: productionNotificationDispatchUseCase,
  },
  metrics: productionMetricsQueryUseCase,
  permissions: productionPermissionUseCase,
  visits: productionVisitUseCase,
  countries: productionCountriesQueryUseCase,
  configuration: productionConfigurationUseCase,
  upload: productionUpload,
  accessGuard: productionAccessHierarchyUseCase,
  accountLockout: AccountLockoutInstance,
  accessJournal: WatchedAccessJournal,
  journalQuery: productionJournalQueryUseCase,
  checkDatabase,
};
