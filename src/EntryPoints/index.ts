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

import { UsersUseCases } from "@src/Domain/User/UserUseCases";
import { BugUseCases } from "@src/Domain/Bug/BugUseCases";
import { MicroServiceUseCases } from "@src/Domain/MicroService/MicroServiceCases";
import { RolesUseCases } from "@src/Domain/Role/RoleUseCases";
import { RolePermissionUseCases } from "@src/Domain/Role/RolePermissionUseCases";
import { UserRoleUseCases } from "@src/Domain/User/UserRoleUseCases";
import { MetricsUseCases } from "@src/Domain/Metrics/MetricsUseCases";
import { PermissionsUseCases } from "@src/Domain/Permission/PermissionUseCases";
import { VisitsUseCases } from "@src/Domain/Visit/VisitUseCases";
import { CountriesUseCases } from "@src/Domain/Countries/CountriesUseCases";

import { isAuthenticated } from "@variamosple/variamos-security";

export function createBaseRouter(
  usersUseCases: UsersUseCases,
  bugUseCases: BugUseCases,
  microServiceUseCases: MicroServiceUseCases,
  rolesUseCases: RolesUseCases,
  rolePermissionUseCases: RolePermissionUseCases,
  userRoleUseCases: UserRoleUseCases,
  metricsUseCases: MetricsUseCases,
  permissionsUseCases: PermissionsUseCases,
  visitsUseCases: VisitsUseCases,
  countriesUseCases: CountriesUseCases,
  upload: MulterUpload,
): Router {
  const baseRouter = Router();

  const authRouter = createAuthRouter(usersUseCases);
  const configurationV1Router = createConfigurationRouter();
  const userRolesRouter = createUserRolesRouter(userRoleUseCases);
  const usersV1Router = createUsersRouter(usersUseCases, userRolesRouter);
  const rolePermissionsRouter = createRolePermissionsRouter(rolePermissionUseCases);
  const rolesV1Router = createRolesRouter(rolesUseCases, rolePermissionsRouter);
  const permissionsV1Router = createPermissionsRouter(permissionsUseCases);
  const microServicesV1Router = createMicroServicesRouter(microServiceUseCases);
  const visitsV1Router = createVisitsRouter(visitsUseCases);
  const metricsV1Router = createMetricsRouter(metricsUseCases);
  const countriesV1Router = createCountriesRouter(countriesUseCases);
  const bugV1Router = createBugRouter(bugUseCases, upload, isAuthenticated);

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
