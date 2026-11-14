import multer from "multer";
import EnvVars from "#src/common/EnvVars.js";
import logger from "#src/common/logger.js";
import { MAX_ATTACHMENT_SIZE_BYTES } from "#src/Domain/Core/File/AllowedFileType.js";
import {
  AccountPasswordServiceInstance,
  BugRepositoriesInstance,
  ConfigEventPublisherInstance,
  ConfigurationRepositoryInstance,
  CountriesRepositoryInstance,
  HealthLogStatisticsInstance,
  MetricsRepositoryInstance,
  MicroServiceRepositoriesInstance,
  PermissionRepositoryInstance,
  RolePermissionRepositoryInstance,
  RoleRepositoryInstance,
  UserRepositoriesInstance,
  UserRoleRepositoryInstance,
  VisitRepositoryInstance,
  WatchedAccessJournal,
  WatchedActivityJournal,
} from "./CompositionRepositories.js";
import { AccessHierarchyRepositoryImpl } from "./DataProviders/AccessControl/AccessHierarchyRepository.js";
import { JournalReaderRepositoryImpl } from "./DataProviders/Activity/JournalReaderRepository.js";
import { FileBackupStatusReader } from "./DataProviders/Backup/FileBackupStatusReader.js";
import { ScheduledConfigurationChangeRepositoryImpl } from "./DataProviders/Configuration/ScheduledConfigurationChangeRepository.js";
import { TrustedDeviceRepositoryImpl } from "./DataProviders/Mfa/TrustedDeviceRepository.js";
import { UserMfaRepositoryImpl } from "./DataProviders/Mfa/UserMfaRepository.js";
import { NotificationRecipientDirectory } from "./DataProviders/Notification/NotificationRecipientDirectory.js";
import { UserPreferencesRepositoryImpl } from "./DataProviders/User/UserPreferencesRepository.js";
import { AccessHierarchyUseCase } from "./Domain/AccessControl/AccessHierarchyUseCase.js";
import { JournalQueryUseCase } from "./Domain/Activity/JournalQueryUseCase.js";
import { BackupAlerts } from "./Domain/Backup/UseCase/BackupAlerts.js";
import { bugSyncIntervalMsOf } from "./Domain/Bug/Entity/BugSchedule.js";
import {
  BugScheduleService,
  type IBugScheduleProvider,
} from "./Domain/Bug/Service/BugScheduleService.js";
import { BugAssignmentUseCase } from "./Domain/Bug/UseCase/BugAssignmentUseCase.js";
import { BugAttachmentUseCase } from "./Domain/Bug/UseCase/BugAttachmentUseCase.js";
import { BugLifecycleUseCase } from "./Domain/Bug/UseCase/BugLifecycleUseCase.js";
import { BugQueryUseCase } from "./Domain/Bug/UseCase/BugQueryUseCase.js";
import { BugSubmissionUseCase } from "./Domain/Bug/UseCase/BugSubmissionUseCase.js";
import { BugSyncUseCase } from "./Domain/Bug/UseCase/BugSyncUseCase.js";
import { ConfigurationUseCase } from "./Domain/Configuration/UseCase/ConfigurationUseCase.js";
import { ScheduledConfigurationChangeUseCase } from "./Domain/Configuration/UseCase/ScheduledConfigurationChangeUseCase.js";
import { RequestModel } from "./Domain/Core/Entity/RequestModel.js";
import { CountriesQueryUseCase } from "./Domain/Countries/UseCase/CountriesQueryUseCase.js";
import { MetricsQueryUseCase } from "./Domain/Metrics/UseCase/MetricsQueryUseCase.js";
import { PendingMfaSignIns } from "./Domain/Mfa/Service/PendingMfaSignIns.js";
import { MfaResetUseCase } from "./Domain/Mfa/UseCase/MfaResetUseCase.js";
import { MfaSignInUseCase } from "./Domain/Mfa/UseCase/MfaSignInUseCase.js";
import { TrustedDeviceUseCase } from "./Domain/Mfa/UseCase/TrustedDeviceUseCase.js";
import { UserMfaUseCase } from "./Domain/Mfa/UseCase/UserMfaUseCase.js";
import { ServiceAlertPolicyService } from "./Domain/MicroService/Service/ServiceAlertPolicyService.js";
import { MicroServiceManagementUseCase } from "./Domain/MicroService/UseCase/MicroServiceManagementUseCase.js";
import { MicroServiceQueryUseCase } from "./Domain/MicroService/UseCase/MicroServiceQueryUseCase.js";
import { ServiceAlerts } from "./Domain/MicroService/UseCase/ServiceAlerts.js";
import { NotificationDispatchUseCase } from "./Domain/Notification/UseCase/NotificationDispatchUseCase.js";
import { PermissionUseCase } from "./Domain/Permission/UseCase/PermissionUseCase.js";
import { RoleManagementUseCase } from "./Domain/Role/UseCase/RoleManagementUseCase.js";
import { RolePermissionUseCase } from "./Domain/Role/UseCase/RolePermissionUseCase.js";
import { RoleQueryUseCase } from "./Domain/Role/UseCase/RoleQueryUseCase.js";
import {
  AccountLockout,
  AccountLockoutPolicyService,
} from "./Domain/User/Service/AccountLockoutService.js";
import { PasswordPolicyService } from "./Domain/User/Service/PasswordPolicyService.js";
import { UserAuthUseCase } from "./Domain/User/UseCase/UserAuthUseCase.js";
import { UserManagementUseCase } from "./Domain/User/UseCase/UserManagementUseCase.js";
import { UserPasswordUseCase } from "./Domain/User/UseCase/UserPasswordUseCase.js";
import { UserPreferencesUseCase } from "./Domain/User/UseCase/UserPreferencesUseCase.js";
import { UserQueryUseCase } from "./Domain/User/UseCase/UserQueryUseCase.js";
import { UserRoleUseCase } from "./Domain/User/UseCase/UserRoleUseCase.js";
import { VisitUseCase } from "./Domain/Visit/UseCase/VisitUseCase.js";
import type { BaseRouterDependencies } from "./EntryPoints/index.js";
import { GitHubIssuesServiceInstance } from "./Infrastructure/GitHub/GitHubIssuesService.js";
import { GitHubTokenResolver } from "./Infrastructure/GitHub/GitHubTokenResolver.js";
import { HealthCheckCollector } from "./Infrastructure/Health/HealthCheckCollector.js";
import { JetLogger } from "./Infrastructure/Logging/JetLogger.js";
import { MailServiceInstance } from "./Infrastructure/Mail/MailService.js";
import { BugAssignmentNotifier } from "./Infrastructure/Notification/BugAssignmentNotifier.js";
import { NotificationAccessTokenIssuer } from "./Infrastructure/Notification/NotificationAccessTokenIssuer.js";
import { NotificationClientInstance } from "./Infrastructure/Notification/NotificationClient.js";
import { ScheduledChangeNotifier } from "./Infrastructure/Notification/ScheduledChangeNotifier.js";
import { ServiceAlertNotifier } from "./Infrastructure/Notification/ServiceAlertNotifier.js";
import {
  followBugSyncInterval,
  followHealthCheckInterval,
} from "./Infrastructure/Scheduling/BackgroundJobs.js";
import { RepeatingTask } from "./Infrastructure/Scheduling/RepeatingTask.js";
import {
  AesGcmSecretCipher,
  parseEncryptionKey,
} from "./Infrastructure/Security/AesGcmSecretCipher.js";
import { DiskStorageServiceInstance } from "./Infrastructure/Storage/DiskStorageService.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "./Infrastructure/VariamosORM.js";

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

// Changes of the settings users notice, planned ahead (EV-115 lot B)
export const productionScheduledConfigurationChangeUseCase =
  new ScheduledConfigurationChangeUseCase({
    changes: new ScheduledConfigurationChangeRepositoryImpl(
      VARIAMOS_ORM,
      DB_SCHEMA,
    ),
    configurations: productionConfigurationUseCase,
    journal: WatchedActivityJournal,
    notifier: new ScheduledChangeNotifier(NotificationClientInstance),
  });

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

const productionUserAuthUseCase = new UserAuthUseCase({
  userRepository: UserRepositoriesInstance.signIn,
  roleRepository: RoleRepositoryInstance,
  logger: JetLogger,
  mailService: MailServiceInstance,
  config: { adminHomeUri: EnvVars.Auth.APP.ADMIN_HOME_URI },
  accountPasswords: AccountPasswordServiceInstance,
  passwordPolicy: PasswordPolicyServiceInstance,
});

const productionUserPasswordUseCase = new UserPasswordUseCase({
  repositories: UserRepositoriesInstance,
  mailService: MailServiceInstance,
  config: {
    passwordResetExpiryInMs: EnvVars.Auth.APP.PASSWORD_RESET_EXPIRY_IN_MS,
    adminHomeUri: EnvVars.Auth.APP.ADMIN_HOME_URI,
  },
  journal: WatchedActivityJournal,
  logger: JetLogger,
  passwordPolicy: PasswordPolicyServiceInstance,
});

const productionUserManagementUseCase = new UserManagementUseCase(
  UserRepositoriesInstance,
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
const productionUserMfaUseCase = new UserMfaUseCase({
  mfaRepository: userMfaRepository,
  passwordCheck: AccountPasswordServiceInstance,
  cipher: mfaSecretCipher,
  logger: JetLogger,
});
// Browsers where the user chose not to be asked the code (lot 6)
const productionTrustedDeviceUseCase = new TrustedDeviceUseCase(
  new TrustedDeviceRepositoryImpl(VARIAMOS_ORM, DB_SCHEMA),
  ConfigurationRepositoryInstance,
  JetLogger,
);
// The code asked after the password, for accounts with a second factor
const productionMfaSignInUseCase = new MfaSignInUseCase({
  mfaRepository: userMfaRepository,
  mfaUseCase: productionUserMfaUseCase,
  cipher: mfaSecretCipher,
  pending: new PendingMfaSignIns(),
  trustedDevices: productionTrustedDeviceUseCase,
  logger: JetLogger,
});
// An administrator turns off the second factor of an account that lost it
const productionMfaResetUseCase = new MfaResetUseCase({
  mfaRepository: userMfaRepository,
  userRepository: UserRepositoriesInstance.accounts,
  mailService: MailServiceInstance,
  journal: WatchedActivityJournal,
  logger: JetLogger,
});

const productionUserQueryUseCase = new UserQueryUseCase(
  UserRepositoriesInstance.accounts,
);

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
const productionBugSubmissionUseCase = new BugSubmissionUseCase({
  bugRepository: BugRepositoriesInstance.bugs,
  userRepository: UserRepositoriesInstance.accounts,
  issueTrackerService: GitHubIssuesServiceInstance,
  githubConfig: bugTrackerConfig,
  tokenResolver: productionGitHubTokenResolver,
  storageService: DiskStorageServiceInstance,
  logger: JetLogger,
});

// Bug tracker schedule, read from the configuration screen (EV-18)
const BugScheduleServiceInstance = new BugScheduleService(
  ConfigurationRepositoryInstance,
);

export const productionBugLifecycleUseCase = new BugLifecycleUseCase({
  repositories: BugRepositoriesInstance,
  issueTrackerService: GitHubIssuesServiceInstance,
  storageService: DiskStorageServiceInstance,
  githubConfig: bugTrackerConfig,
  tokenResolver: productionGitHubTokenResolver,
  journal: WatchedActivityJournal,
  logger: JetLogger,
  schedule: BugScheduleServiceInstance,
});

const productionBugSyncUseCase = new BugSyncUseCase({
  repositories: BugRepositoriesInstance,
  issueTrackerService: GitHubIssuesServiceInstance,
  githubConfig: bugTrackerConfig,
  tokenResolver: productionGitHubTokenResolver,
  logger: JetLogger,
  journal: WatchedActivityJournal,
});

const productionBugQueryUseCase = new BugQueryUseCase(
  BugRepositoriesInstance,
  bugTrackerConfig,
  JetLogger,
);

const productionBugAssignmentUseCase = new BugAssignmentUseCase(
  BugRepositoriesInstance,
  new BugAssignmentNotifier(NotificationClientInstance),
  WatchedActivityJournal,
  JetLogger,
);

const productionBugAttachmentUseCase = new BugAttachmentUseCase(
  BugRepositoriesInstance,
  DiskStorageServiceInstance,
  JetLogger,
  WatchedActivityJournal,
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
  MicroServiceRepositoriesInstance,
);

const productionMicroServiceManagementUseCase =
  new MicroServiceManagementUseCase({
    repositories: MicroServiceRepositoriesInstance,
    logger: JetLogger,
    configurationRepository: ConfigurationRepositoryInstance,
    configEventPublisher: ConfigEventPublisherInstance,
    journal: WatchedActivityJournal,
  });

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
  MicroServiceRepositoriesInstance.services,
  HealthLogStatisticsInstance,
  EnvVars.MONITORING.HEALTH_CHECK_INTERVAL_MS,
);
MicroServiceRepositoriesInstance.control.setHealthCollector(
  HealthCheckCollectorInstance,
);
ConfigEventPublisherInstance.addListener(
  followHealthCheckInterval(HealthCheckCollectorInstance),
);
// A mail when a service stops answering, then when it answers again; the
// addresses and the number of failed checks follow the configuration screen
const ServiceAlertsInstance = new ServiceAlerts(
  new ServiceAlertPolicyService(ConfigurationRepositoryInstance, JetLogger),
  new ServiceAlertNotifier(MailServiceInstance, JetLogger),
  JetLogger,
);
HealthCheckCollectorInstance.addCheckListener((check) =>
  ServiceAlertsInstance.onHealthCheck(check),
);

// A mail when the nightly database backup goes wrong, to the same addresses;
// off without the status file written by the server
export const BackupAlertsInstance = EnvVars.BACKUP.STATUS_FILE
  ? new BackupAlerts(
      new FileBackupStatusReader(EnvVars.BACKUP.STATUS_FILE, JetLogger),
      new ServiceAlertPolicyService(ConfigurationRepositoryInstance, JetLogger),
      new ServiceAlertNotifier(MailServiceInstance, JetLogger),
      JetLogger,
    )
  : null;

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
    preferences: new UserPreferencesUseCase(
      new UserPreferencesRepositoryImpl(VARIAMOS_ORM, DB_SCHEMA),
    ),
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
  scheduledConfiguration: productionScheduledConfigurationChangeUseCase,
  upload: productionUpload,
  accessGuard: productionAccessHierarchyUseCase,
  accountLockout: AccountLockoutInstance,
  accessJournal: WatchedAccessJournal,
  journalQuery: productionJournalQueryUseCase,
  checkDatabase,
  backups: BackupAlertsInstance,
};
