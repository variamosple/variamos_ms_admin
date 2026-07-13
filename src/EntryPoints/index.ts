import EnvVars from "@src/common/EnvVars";
import { Router } from "express";
import { createAuthRouter, AUTH_ROUTE } from "./AuthRouter";
import { createConfigurationRouter, CONFIGURATION_V1_ROUTE } from "./ConfigurationRouter";
import { createCountriesRouter, COUNTRIES_V1_ROUTE } from "./CountriesV1Router";
import { createMetricsRouter, METRICS_V1_ROUTE } from "./MetricsV1Router";
import { createMicroServicesRouter, MICRO_SERVICES_V1_ROUTE } from "./MicroServicesV1Router";
import { createPermissionsRouter, PERMISSIONS_V1_ROUTE } from "./PermissionsV1Router";
import { createRolesRouter, ROLES_V1_ROUTE } from "./RolesV1Router";
import { createRolePermissionsRouter } from "./RolePermissionsV1Router";
import { createUsersRouter, USERS_V1_ROUTE } from "./UsersV1Router";
import { createUserRolesRouter } from "./UserRolesV1Router";
import { createVisitsRouter, VISITS_V1_ROUTE } from "./VisitsV1Router";
import { createBugRouter, BUG_V1_ROUTE, MulterUpload } from "./BugRouter";

// User Flow Use Cases
import { UserAuthUseCase } from "@src/Domain/User/UseCase/UserAuthUseCase";
import { UserPasswordUseCase } from "@src/Domain/User/UseCase/UserPasswordUseCase";
import { UserManagementUseCase } from "@src/Domain/User/UseCase/UserManagementUseCase";
import { UserQueryUseCase } from "@src/Domain/User/UseCase/UserQueryUseCase";
import { UserRoleUseCase } from "@src/Domain/User/UseCase/UserRoleUseCase";

// Bug Flow Use Cases
import { BugSubmissionUseCase } from "@src/Domain/Bug/UseCase/BugSubmissionUseCase";
import { BugLifecycleUseCase } from "@src/Domain/Bug/UseCase/BugLifecycleUseCase";
import { BugSyncUseCase } from "@src/Domain/Bug/UseCase/BugSyncUseCase";
import { BugQueryUseCase } from "@src/Domain/Bug/UseCase/BugQueryUseCase";
import { BugAttachmentUseCase } from "@src/Domain/Bug/UseCase/BugAttachmentUseCase";

// Role & Permission Use Cases
import { RoleManagementUseCase } from "@src/Domain/Role/UseCase/RoleManagementUseCase";
import { RoleQueryUseCase } from "@src/Domain/Role/UseCase/RoleQueryUseCase";
import { RolePermissionUseCase } from "@src/Domain/Role/UseCase/RolePermissionUseCase";
import { PermissionUseCase } from "@src/Domain/Permission/UseCase/PermissionUseCase";

// Other Use Cases
import { MetricsQueryUseCase } from "@src/Domain/Metrics/UseCase/MetricsQueryUseCase";
import { VisitUseCase } from "@src/Domain/Visit/UseCase/VisitUseCase";
import { CountriesQueryUseCase } from "@src/Domain/Countries/UseCase/CountriesQueryUseCase";
import { MicroServiceQueryUseCase } from "@src/Domain/MicroService/UseCase/MicroServiceQueryUseCase";
import { MicroServiceManagementUseCase } from "@src/Domain/MicroService/UseCase/MicroServiceManagementUseCase";

import { isAuthenticated } from "@variamosple/variamos-security";

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
  upload: MulterUpload,
): Router {
  const baseRouter = Router();

  const authRouter = createAuthRouter(
    usersUseCases.auth,
    usersUseCases.password,
    usersUseCases.management,
    usersUseCases.query,
  );
  const configurationV1Router = createConfigurationRouter();
  const userRolesRouter = createUserRolesRouter(usersUseCases.role);
  const usersV1Router = createUsersRouter(
    usersUseCases.query,
    usersUseCases.password, // needed for generateRecoveryLink
    usersUseCases.management,
    userRolesRouter,
  );
  const rolePermissionsRouter = createRolePermissionsRouter(rolesUseCases.permission);
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

  baseRouter.get("/version", function (_, res) {
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
