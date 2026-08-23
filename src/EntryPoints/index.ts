import EnvVars from "@src/common/EnvVars.js";
import type { BugAttachmentUseCase } from "@src/Domain/Bug/UseCase/BugAttachmentUseCase.js";
import type { BugLifecycleUseCase } from "@src/Domain/Bug/UseCase/BugLifecycleUseCase.js";
import type { BugQueryUseCase } from "@src/Domain/Bug/UseCase/BugQueryUseCase.js";
// Bug Flow Use Cases
import type { BugSubmissionUseCase } from "@src/Domain/Bug/UseCase/BugSubmissionUseCase.js";
import type { BugSyncUseCase } from "@src/Domain/Bug/UseCase/BugSyncUseCase.js";
import type { ConfigurationUseCase } from "@src/Domain/Configuration/UseCase/ConfigurationUseCase.js";
import type { CountriesQueryUseCase } from "@src/Domain/Countries/UseCase/CountriesQueryUseCase.js";
// Other Use Cases
import type { MetricsQueryUseCase } from "@src/Domain/Metrics/UseCase/MetricsQueryUseCase.js";
import type { MicroServiceManagementUseCase } from "@src/Domain/MicroService/UseCase/MicroServiceManagementUseCase.js";
import type { MicroServiceQueryUseCase } from "@src/Domain/MicroService/UseCase/MicroServiceQueryUseCase.js";
import type { PermissionUseCase } from "@src/Domain/Permission/UseCase/PermissionUseCase.js";
// Role & Permission Use Cases
import type { RoleManagementUseCase } from "@src/Domain/Role/UseCase/RoleManagementUseCase.js";
import type { RolePermissionUseCase } from "@src/Domain/Role/UseCase/RolePermissionUseCase.js";
import type { RoleQueryUseCase } from "@src/Domain/Role/UseCase/RoleQueryUseCase.js";

// User Flow Use Cases
import type { UserAuthUseCase } from "@src/Domain/User/UseCase/UserAuthUseCase.js";
import type { UserManagementUseCase } from "@src/Domain/User/UseCase/UserManagementUseCase.js";
import type { UserPasswordUseCase } from "@src/Domain/User/UseCase/UserPasswordUseCase.js";
import type { UserQueryUseCase } from "@src/Domain/User/UseCase/UserQueryUseCase.js";
import type { UserRoleUseCase } from "@src/Domain/User/UseCase/UserRoleUseCase.js";
import type { VisitUseCase } from "@src/Domain/Visit/UseCase/VisitUseCase.js";
import { isAuthenticated } from "@variamosple/variamos-security";
import { Router } from "express";
import { AUTH_ROUTE, createAuthRouter } from "./AuthRouter.js";
import {
  BUG_V1_ROUTE,
  createBugRouter,
  type MulterUpload,
} from "./BugRouter.js";
import {
  CONFIGURATION_V1_ROUTE,
  createConfigurationRouter,
} from "./ConfigurationRouter.js";
import {
  COUNTRIES_V1_ROUTE,
  createCountriesRouter,
} from "./CountriesV1Router.js";
import { createMetricsRouter, METRICS_V1_ROUTE } from "./MetricsV1Router.js";
import {
  createMicroServicesRouter,
  MICRO_SERVICES_V1_ROUTE,
} from "./MicroServicesV1Router.js";
import {
  createPermissionsRouter,
  PERMISSIONS_V1_ROUTE,
} from "./PermissionsV1Router.js";
import { createRolePermissionsRouter } from "./RolePermissionsV1Router.js";
import { createRolesRouter, ROLES_V1_ROUTE } from "./RolesV1Router.js";
import { createUserRolesRouter } from "./UserRolesV1Router.js";
import { createUsersRouter, USERS_V1_ROUTE } from "./UsersV1Router.js";
import { createVisitsRouter, VISITS_V1_ROUTE } from "./VisitsV1Router.js";

export interface UserFlowUseCases {
  auth: UserAuthUseCase;
  password: UserPasswordUseCase;
  management: UserManagementUseCase;
  query: UserQueryUseCase;
  role: UserRoleUseCase;
}

export interface BugFlowUseCases {
  submission: BugSubmissionUseCase;
  lifecycle: BugLifecycleUseCase;
  sync: BugSyncUseCase;
  query: BugQueryUseCase;
  attachment: BugAttachmentUseCase;
}

export interface MicroServiceFlowUseCases {
  query: MicroServiceQueryUseCase;
  management: MicroServiceManagementUseCase;
}

export interface RoleFlowUseCases {
  management: RoleManagementUseCase;
  query: RoleQueryUseCase;
  permission: RolePermissionUseCase;
}

export function createBaseRouter(
  usersUseCases: UserFlowUseCases,
  bugUseCases: BugFlowUseCases,
  microServiceUseCases: MicroServiceFlowUseCases,
  rolesUseCases: RoleFlowUseCases,
  metricsUseCase: MetricsQueryUseCase,
  permissionsUseCase: PermissionUseCase,
  visitsUseCase: VisitUseCase,
  countriesUseCase: CountriesQueryUseCase,
  configurationUseCase: ConfigurationUseCase,
  upload: MulterUpload,
): Router {
  const baseRouter = Router();

  const authRouter = createAuthRouter(
    usersUseCases.auth,
    usersUseCases.password,
    usersUseCases.management,
    usersUseCases.query,
  );
  const configurationV1Router = createConfigurationRouter(configurationUseCase);
  const userRolesRouter = createUserRolesRouter(usersUseCases.role);
  const usersV1Router = createUsersRouter(
    usersUseCases.query,
    usersUseCases.password, // needed for generateRecoveryLink
    usersUseCases.management,
    userRolesRouter,
  );
  const rolePermissionsRouter = createRolePermissionsRouter(
    rolesUseCases.permission,
  );
  const rolesV1Router = createRolesRouter(
    rolesUseCases.management,
    rolesUseCases.query,
    rolePermissionsRouter,
  );
  const permissionsV1Router = createPermissionsRouter(permissionsUseCase);
  const microServicesV1Router = createMicroServicesRouter(
    microServiceUseCases.query,
    microServiceUseCases.management,
  );
  const visitsV1Router = createVisitsRouter(visitsUseCase);
  const metricsV1Router = createMetricsRouter(metricsUseCase);
  const countriesV1Router = createCountriesRouter(countriesUseCase);
  const bugV1Router = createBugRouter(
    bugUseCases.submission,
    bugUseCases.lifecycle,
    bugUseCases.sync,
    bugUseCases.query,
    bugUseCases.attachment,
    upload,
    isAuthenticated,
  );

  baseRouter.use(AUTH_ROUTE, authRouter);
  baseRouter.use(CONFIGURATION_V1_ROUTE, configurationV1Router);
  baseRouter.use(USERS_V1_ROUTE, usersV1Router);
  baseRouter.use(ROLES_V1_ROUTE, rolesV1Router);
  baseRouter.use(PERMISSIONS_V1_ROUTE, permissionsV1Router);
  baseRouter.use(MICRO_SERVICES_V1_ROUTE, microServicesV1Router);
  baseRouter.use(VISITS_V1_ROUTE, visitsV1Router);
  baseRouter.use(METRICS_V1_ROUTE, metricsV1Router);
  baseRouter.use(COUNTRIES_V1_ROUTE, countriesV1Router);
  baseRouter.use(BUG_V1_ROUTE, bugV1Router);

  baseRouter.get("/version", (_, res) => {
    try {
      const data = {
        message: "variamos_ms_admin",
        version: EnvVars.VERSION,
      };

      res.status(200).json(data);
    } catch (error) {
      res.status(400).send(JSON.stringify(error));
    }
  });

  return baseRouter;
}
