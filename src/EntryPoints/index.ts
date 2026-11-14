// User Flow Use Cases
import { isAuthenticated } from "@variamosple/variamos-security";
import { type RequestHandler, Router } from "express";
import EnvVars from "#src/common/EnvVars.js";
import type { IAccessJournal } from "#src/Domain/Activity/IAccessJournal.js";
import type { JournalQueryUseCase } from "#src/Domain/Activity/JournalQueryUseCase.js";
import type { BugAssignmentUseCase } from "#src/Domain/Bug/UseCase/BugAssignmentUseCase.js";
import type { BugAttachmentUseCase } from "#src/Domain/Bug/UseCase/BugAttachmentUseCase.js";
import type { BugLifecycleUseCase } from "#src/Domain/Bug/UseCase/BugLifecycleUseCase.js";
import type { BugQueryUseCase } from "#src/Domain/Bug/UseCase/BugQueryUseCase.js";
// Bug Flow Use Cases
import type { BugSubmissionUseCase } from "#src/Domain/Bug/UseCase/BugSubmissionUseCase.js";
import type { BugSyncUseCase } from "#src/Domain/Bug/UseCase/BugSyncUseCase.js";
import type { ConfigurationUseCase } from "#src/Domain/Configuration/UseCase/ConfigurationUseCase.js";
import type { ScheduledConfigurationChangeUseCase } from "#src/Domain/Configuration/UseCase/ScheduledConfigurationChangeUseCase.js";
import type { CountriesQueryUseCase } from "#src/Domain/Countries/UseCase/CountriesQueryUseCase.js";
// Other Use Cases
import type { MetricsQueryUseCase } from "#src/Domain/Metrics/UseCase/MetricsQueryUseCase.js";
import type { MfaResetUseCase } from "#src/Domain/Mfa/UseCase/MfaResetUseCase.js";
import type { MfaSignInUseCase } from "#src/Domain/Mfa/UseCase/MfaSignInUseCase.js";
import type { TrustedDeviceUseCase } from "#src/Domain/Mfa/UseCase/TrustedDeviceUseCase.js";
import type { UserMfaUseCase } from "#src/Domain/Mfa/UseCase/UserMfaUseCase.js";
import type { MicroServiceManagementUseCase } from "#src/Domain/MicroService/UseCase/MicroServiceManagementUseCase.js";
import type { MicroServiceQueryUseCase } from "#src/Domain/MicroService/UseCase/MicroServiceQueryUseCase.js";
import type { INotificationAccessTokenIssuer } from "#src/Domain/Notification/INotificationAccessTokenIssuer.js";
import type { NotificationDispatchUseCase } from "#src/Domain/Notification/UseCase/NotificationDispatchUseCase.js";
import type { PermissionUseCase } from "#src/Domain/Permission/UseCase/PermissionUseCase.js";
// Role & Permission Use Cases
import type { RoleManagementUseCase } from "#src/Domain/Role/UseCase/RoleManagementUseCase.js";
import type { RolePermissionUseCase } from "#src/Domain/Role/UseCase/RolePermissionUseCase.js";
import type { RoleQueryUseCase } from "#src/Domain/Role/UseCase/RoleQueryUseCase.js";
import type { AccountLockout } from "#src/Domain/User/Service/AccountLockoutService.js";
import type { UserAuthUseCase } from "#src/Domain/User/UseCase/UserAuthUseCase.js";
import type { UserManagementUseCase } from "#src/Domain/User/UseCase/UserManagementUseCase.js";
import type { UserPasswordUseCase } from "#src/Domain/User/UseCase/UserPasswordUseCase.js";
import type { UserPreferencesUseCase } from "#src/Domain/User/UseCase/UserPreferencesUseCase.js";
import type { UserQueryUseCase } from "#src/Domain/User/UseCase/UserQueryUseCase.js";
import type { UserRoleUseCase } from "#src/Domain/User/UseCase/UserRoleUseCase.js";
import type { VisitUseCase } from "#src/Domain/Visit/UseCase/VisitUseCase.js";
import {
  ADMIN_NOTIFICATIONS_V1_ROUTE,
  createAdminNotificationsRouter,
} from "./AdminNotificationsRouter.js";
import { AUTH_ROUTE, createAuthRouter } from "./AuthRouter.js";
import { recordRefusals } from "./accessJournal.js";
import {
  BACKUPS_V1_ROUTE,
  type BackupReports,
  createBackupsRouter,
} from "./BackupsV1Router.js";
import { BUG_V1_ROUTE, createBugRouter } from "./BugRouter.js";
import type { MulterUpload } from "./bugRouteSupport.js";
import {
  CONFIGURATION_V1_ROUTE,
  createConfigurationRouter,
} from "./ConfigurationRouter.js";
import {
  COUNTRIES_V1_ROUTE,
  createCountriesRouter,
} from "./CountriesV1Router.js";
import { createHealthRouter, type DatabaseCheck } from "./HealthRouter.js";
import {
  ACCESS_LOGS_V1_ROUTE,
  ACTIVITY_LOGS_V1_ROUTE,
  createAccessLogsRouter,
  createActivityLogsRouter,
} from "./JournalV1Router.js";
import { createMetricsRouter, METRICS_V1_ROUTE } from "./MetricsV1Router.js";
import { createMfaRouter, MFA_ROUTE } from "./MfaRouter.js";
import {
  createMicroServicesRouter,
  MICRO_SERVICES_V1_ROUTE,
} from "./MicroServicesV1Router.js";
import {
  createMyAccountPreferencesRouter,
  MY_ACCOUNT_PREFERENCES_ROUTE,
} from "./MyAccountPreferencesRouter.js";
import {
  createNotificationAccessRouter,
  NOTIFICATION_ACCESS_V1_ROUTE,
} from "./NotificationAccessRouter.js";
import {
  createPermissionsRouter,
  PERMISSIONS_V1_ROUTE,
} from "./PermissionsV1Router.js";
import { applyRateLimits } from "./RateLimits.js";
import { createRolePermissionsRouter } from "./RolePermissionsV1Router.js";
import { createRolesRouter, ROLES_V1_ROUTE } from "./RolesV1Router.js";
import type { AccessGuard } from "./requireAccess.js";
import {
  createScheduledConfigurationChangeRouter,
  SCHEDULED_CHANGES_V1_ROUTE,
} from "./ScheduledConfigurationChangeRouter.js";
import { createUserMfaRouter, USER_MFA_V1_ROUTE } from "./UserMfaV1Router.js";
import { createUserRolesRouter } from "./UserRolesV1Router.js";
import { createUsersRouter, USERS_V1_ROUTE } from "./UsersV1Router.js";
import { createVisitsRouter, VISITS_V1_ROUTE } from "./VisitsV1Router.js";

interface UserFlowUseCases {
  auth: UserAuthUseCase;
  password: UserPasswordUseCase;
  management: UserManagementUseCase;
  query: UserQueryUseCase;
  role: UserRoleUseCase;
  preferences: UserPreferencesUseCase;
}

interface BugFlowUseCases {
  submission: BugSubmissionUseCase;
  lifecycle: BugLifecycleUseCase;
  sync: BugSyncUseCase;
  query: BugQueryUseCase;
  attachment: BugAttachmentUseCase;
  assignment: BugAssignmentUseCase;
}

interface MicroServiceFlowUseCases {
  query: MicroServiceQueryUseCase;
  management: MicroServiceManagementUseCase;
}

interface RoleFlowUseCases {
  management: RoleManagementUseCase;
  query: RoleQueryUseCase;
  permission: RolePermissionUseCase;
}

interface MfaFlowUseCases {
  user: UserMfaUseCase;
  signIn: MfaSignInUseCase;
  reset: MfaResetUseCase;
  trustedDevices: TrustedDeviceUseCase;
}

interface NotificationFlow {
  accessTokenIssuer: INotificationAccessTokenIssuer;
  dispatch: NotificationDispatchUseCase;
}

/** What the routers need, built by the composition (T-18 lot 4a). */
export interface BaseRouterDependencies {
  users: UserFlowUseCases;
  bugs: BugFlowUseCases;
  microServices: MicroServiceFlowUseCases;
  roles: RoleFlowUseCases;
  mfa: MfaFlowUseCases;
  notifications: NotificationFlow;
  metrics: MetricsQueryUseCase;
  permissions: PermissionUseCase;
  visits: VisitUseCase;
  countries: CountriesQueryUseCase;
  configuration: ConfigurationUseCase;
  scheduledConfiguration: ScheduledConfigurationChangeUseCase;
  upload: MulterUpload;
  accessGuard: AccessGuard;
  accountLockout: AccountLockout;
  accessJournal: IAccessJournal;
  journalQuery: JournalQueryUseCase;
  checkDatabase: DatabaseCheck;
  backups: BackupReports;
}

// The accounts, with the roles of each account under them
const createAccountsRouter = (
  usersUseCases: UserFlowUseCases,
  accessGuard: AccessGuard,
) =>
  createUsersRouter({
    userQueryUseCase: usersUseCases.query,
    userPasswordUseCase: usersUseCases.password, // needed for generateRecoveryLink
    userManagementUseCase: usersUseCases.management,
    userRolesRouter: createUserRolesRouter(usersUseCases.role, accessGuard),
    accessGuard,
  });

// The roles, with the permissions of each role under them
const createRolesTreeRouter = (
  rolesUseCases: RoleFlowUseCases,
  accessGuard: AccessGuard,
) =>
  createRolesRouter(
    rolesUseCases.management,
    rolesUseCases.query,
    createRolePermissionsRouter(rolesUseCases.permission, accessGuard),
    accessGuard,
  );

export function createBaseRouter({
  users: usersUseCases,
  bugs: bugUseCases,
  microServices: microServiceUseCases,
  roles: rolesUseCases,
  mfa,
  notifications,
  metrics: metricsUseCase,
  permissions: permissionsUseCase,
  visits: visitsUseCase,
  countries: countriesUseCase,
  configuration: configurationUseCase,
  scheduledConfiguration,
  upload,
  accessGuard,
  accountLockout,
  accessJournal,
  journalQuery,
  checkDatabase,
  backups,
}: BaseRouterDependencies): Router {
  const baseRouter = Router();

  const authRouter = createAuthRouter({
    userAuthUseCase: usersUseCases.auth,
    userPasswordUseCase: usersUseCases.password,
    userManagementUseCase: usersUseCases.management,
    userQueryUseCase: usersUseCases.query,
    mfaSignIn: mfa.signIn,
    accessJournal,
  });
  const configurationV1Router = createConfigurationRouter(configurationUseCase);
  const usersV1Router = createAccountsRouter(usersUseCases, accessGuard);
  const rolesV1Router = createRolesTreeRouter(rolesUseCases, accessGuard);
  const permissionsV1Router = createPermissionsRouter(permissionsUseCase);
  const microServicesV1Router = createMicroServicesRouter(
    microServiceUseCases.query,
    microServiceUseCases.management,
  );
  const visitsV1Router = createVisitsRouter(visitsUseCase);
  const metricsV1Router = createMetricsRouter(metricsUseCase);
  const countriesV1Router = createCountriesRouter(countriesUseCase);
  const bugV1Router = createBugRouter({
    bugSubmissionUseCase: bugUseCases.submission,
    bugLifecycleUseCase: bugUseCases.lifecycle,
    bugSyncUseCase: bugUseCases.sync,
    bugQueryUseCase: bugUseCases.query,
    bugAttachmentUseCase: bugUseCases.attachment,
    upload,
    authMiddleware: isAuthenticated,
    bugAssignmentUseCase: bugUseCases.assignment,
  });
  const adminNotificationsV1Router = createAdminNotificationsRouter(
    notifications.dispatch,
  );
  const notificationAccessV1Router = createNotificationAccessRouter(
    notifications.accessTokenIssuer,
    isAuthenticated,
  );

  // First, so that it sees the refusals of every router and limit (T-24)
  baseRouter.use(recordRefusals(accessJournal));
  applyRateLimits(baseRouter, accountLockout, accessJournal);
  baseRouter.use(MFA_ROUTE, createMfaRouter(mfa.user, mfa.trustedDevices));
  baseRouter.use(
    MY_ACCOUNT_PREFERENCES_ROUTE,
    createMyAccountPreferencesRouter(usersUseCases.preferences),
  );
  baseRouter.use(AUTH_ROUTE, authRouter);
  baseRouter.use(
    SCHEDULED_CHANGES_V1_ROUTE,
    createScheduledConfigurationChangeRouter(scheduledConfiguration),
  );
  baseRouter.use(CONFIGURATION_V1_ROUTE, configurationV1Router);
  baseRouter.use(
    USER_MFA_V1_ROUTE,
    createUserMfaRouter(mfa.reset, accessGuard),
  );
  baseRouter.use(USERS_V1_ROUTE, usersV1Router);
  baseRouter.use(ROLES_V1_ROUTE, rolesV1Router);
  baseRouter.use(PERMISSIONS_V1_ROUTE, permissionsV1Router);
  baseRouter.use(MICRO_SERVICES_V1_ROUTE, microServicesV1Router);
  baseRouter.use(VISITS_V1_ROUTE, visitsV1Router);
  baseRouter.use(BACKUPS_V1_ROUTE, createBackupsRouter(backups));
  baseRouter.use(METRICS_V1_ROUTE, metricsV1Router);
  baseRouter.use(COUNTRIES_V1_ROUTE, countriesV1Router);
  baseRouter.use(BUG_V1_ROUTE, bugV1Router);
  baseRouter.use(ADMIN_NOTIFICATIONS_V1_ROUTE, adminNotificationsV1Router);
  baseRouter.use(NOTIFICATION_ACCESS_V1_ROUTE, notificationAccessV1Router);
  baseRouter.use(
    ACTIVITY_LOGS_V1_ROUTE,
    createActivityLogsRouter(journalQuery),
  );
  baseRouter.use(ACCESS_LOGS_V1_ROUTE, createAccessLogsRouter(journalQuery));
  baseRouter.use("/health", createHealthRouter(checkDatabase));

  baseRouter.get("/version", sendVersion);

  return baseRouter;
}

// The name and version of the service
const sendVersion: RequestHandler = (_, res) => {
  try {
    const data = {
      message: "variamos_ms_admin",
      version: EnvVars.VERSION,
    };

    res.status(200).json(data);
  } catch (error) {
    res.status(400).send(JSON.stringify(error));
  }
};
