import EnvVars from "#src/common/EnvVars.js";
import logger from "#src/common/logger.js";
import { SecurityAlertRecipientRepository } from "./DataProviders/AccessControl/SecurityAlertRecipientRepository.js";
import { AccessJournalRepositoryImpl } from "./DataProviders/Activity/AccessJournalRepository.js";
import { ActivityJournalRepositoryImpl } from "./DataProviders/Activity/ActivityJournalRepository.js";
import { BugAssigneeRepositoryImpl } from "./DataProviders/Bug/BugAssigneeRepository.js";
import { BugAttachmentRepositoryImpl } from "./DataProviders/Bug/BugAttachmentRepository.js";
import { BugNoteRepositoryImpl } from "./DataProviders/Bug/BugNoteRepository.js";
import { BugQueryRepositoryImpl } from "./DataProviders/Bug/BugQueryRepository.js";
import { BugRepositoryImpl } from "./DataProviders/Bug/BugRepository.js";
import { ConfigurationRepositoryImpl } from "./DataProviders/Configuration/ConfigurationRepository.js";
import { SecretConfigurationValue } from "./DataProviders/Configuration/SecretConfigurationValue.js";
import { CountriesRepositoryImpl } from "./DataProviders/Countries/CountriesRepository.js";
import { MetricsRepositoryImpl } from "./DataProviders/Metrics/MetricsRepository.js";
import { HealthLogStatistics } from "./DataProviders/MicroService/HealthLogStatistics.js";
import { MicroServiceConfigRepositoryImpl } from "./DataProviders/MicroService/MicroServiceConfigRepository.js";
import { MicroServiceControlRepositoryImpl } from "./DataProviders/MicroService/MicroServiceControlRepository.js";
import { MicroServiceRepositoryImpl } from "./DataProviders/MicroService/MicroServiceRepository.js";
import { PermissionRepositoryImpl } from "./DataProviders/Permission/PermissionRepository.js";
import { RolePermissionRepositoryImpl } from "./DataProviders/Role/RolePermissionRepository.js";
import { RoleRepositoryImpl } from "./DataProviders/Role/RoleRepository.js";
import { UserRepositoryImpl } from "./DataProviders/User/UserRepository.js";
import { UserRoleRepositoryImpl } from "./DataProviders/User/UserRoleRepository.js";
import { VisitRepositoryImpl } from "./DataProviders/Visit/VisitRepository.js";
import { TOP_PERMISSION } from "./Domain/AccessControl/AccessHierarchyUseCase.js";
import { SecurityAlertPolicyService } from "./Domain/Activity/SecurityAlertPolicyService.js";
import {
  SecurityAlertDetector,
  watchedAccessJournal,
  watchedActivityJournal,
} from "./Domain/Activity/SecurityAlerts.js";
import type { BugRepositories } from "./Domain/Bug/Repository/BugRepositories.js";
import type { MicroServiceRepositories } from "./Domain/MicroService/Repository/MicroServiceRepositories.js";
import { AccountPasswordService } from "./Domain/User/Service/AccountPasswordService.js";
import { PasswordHashingCostService } from "./Domain/User/Service/PasswordHashingCostService.js";
import { JetLogger } from "./Infrastructure/Logging/JetLogger.js";
import { MailServiceInstance } from "./Infrastructure/Mail/MailService.js";
import { ConfigEventPublisherImpl } from "./Infrastructure/Messaging/ConfigEventPublisher.js";
import { NotificationClientInstance } from "./Infrastructure/Notification/NotificationClient.js";
import { SecurityAlertNotifier } from "./Infrastructure/Notification/SecurityAlertNotifier.js";
import {
  AesGcmSecretCipher,
  parseEncryptionKey,
} from "./Infrastructure/Security/AesGcmSecretCipher.js";
import { BcryptPasswordHasher } from "./Infrastructure/Security/BcryptPasswordHasher.js";
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
export const HealthLogStatisticsInstance = new HealthLogStatistics(
  VARIAMOS_ORM,
  DB_SCHEMA,
);

// One repository per subject of the monitoring
export const MicroServiceRepositoriesInstance = {
  services: new MicroServiceRepositoryImpl({
    socketPath: EnvVars.DOCKER.SOCKET_PATH,
    statistics: HealthLogStatisticsInstance,
  }),
  control: new MicroServiceControlRepositoryImpl({
    socketPath: EnvVars.DOCKER.SOCKET_PATH,
  }),
  configuration: new MicroServiceConfigRepositoryImpl({
    secrets: SecretConfigurationValueInstance,
  }),
} satisfies MicroServiceRepositories;

export const RoleRepositoryInstance = new RoleRepositoryImpl();
export const RolePermissionRepositoryInstance =
  new RolePermissionRepositoryImpl();
export const UserRoleRepositoryInstance = new UserRoleRepositoryImpl();
export const PermissionRepositoryInstance = new PermissionRepositoryImpl();
export const VisitRepositoryInstance = new VisitRepositoryImpl();
export const CountriesRepositoryInstance = new CountriesRepositoryImpl();
export const MetricsRepositoryInstance = new MetricsRepositoryImpl();
// One repository per subject of the bug tracker
export const BugRepositoriesInstance: BugRepositories = {
  bugs: new BugRepositoryImpl(),
  queries: new BugQueryRepositoryImpl(),
  attachments: new BugAttachmentRepositoryImpl(),
  notes: new BugNoteRepositoryImpl(),
  assignees: new BugAssigneeRepositoryImpl(),
};
export const ConfigurationRepositoryInstance = new ConfigurationRepositoryImpl(
  SecretConfigurationValueInstance,
);
// security.bcrypt_salt_rounds, read at each hash; BCRYPT_SALT_ROUNDS as fallback
const PasswordHasherInstance = new BcryptPasswordHasher(
  new PasswordHashingCostService(
    ConfigurationRepositoryInstance,
    EnvVars.Auth.APP.BCRYPT_SALT_ROUNDS,
  ),
);
export const UserRepositoryInstance = new UserRepositoryImpl(
  PasswordHasherInstance,
);
// Whether a password opens an account: decided in the domain (EV-98)
export const AccountPasswordServiceInstance = new AccountPasswordService(
  UserRepositoryInstance,
  PasswordHasherInstance,
  JetLogger,
);
export const ConfigEventPublisherInstance = new ConfigEventPublisherImpl();
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
const SecurityAlertDetectorInstance = new SecurityAlertDetector({
  policyProvider: new SecurityAlertPolicyService(
    ConfigurationRepositoryInstance,
    JetLogger,
  ),
  recipients: new SecurityAlertRecipientRepository(TOP_PERMISSION),
  notifier: new SecurityAlertNotifier(
    NotificationClientInstance,
    MailServiceInstance,
    JetLogger,
  ),
  journal: ActivityJournalInstance,
  logger: JetLogger,
});
export const WatchedActivityJournal = watchedActivityJournal(
  ActivityJournalInstance,
  SecurityAlertDetectorInstance,
);
export const WatchedAccessJournal = watchedAccessJournal(
  AccessJournalInstance,
  SecurityAlertDetectorInstance,
);
