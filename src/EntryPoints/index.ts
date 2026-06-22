import EnvVars from "@src/common/EnvVars";
import { Router } from "express";
import authRouter, { AUTH_ROUTE } from "./AuthRouter";

import configurationV1Router, {
  CONFIGURATION_V1_ROUTE,
} from "./ConfigurationRouter";
import countriesV1Router, { COUNTRIES_V1_ROUTE } from "./CountriesV1Router";
import metricsV1Router, { METRICS_V1_ROUTE } from "./MetricsV1Router";
import microServicesV1Router, {
  MICRO_SERVICES_V1_ROUTE,
} from "./MicroServicesV1Router";
import permissionsV1Router, {
  PERMISSIONS_V1_ROUTE,
} from "./PermissionsV1Router";
import rolesV1Router, { ROLES_V1_ROUTE } from "./RolesV1Router";
import usersV1Router, { USERS_V1_ROUTE } from "./UsersV1Router";
import visitsV1Router, { VISITS_V1_ROUTE } from "./VisitsV1Router";
import { createBugRouter, BUG_V1_ROUTE } from "./BugRouter";
import { BugUseCases } from "@src/Domain/Bug/BugUseCases";
import { GitHubIssuesServiceInstance } from "@src/Infrastructure/GitHub/GitHubIssuesService";
import { DiskStorageServiceInstance } from "@src/Infrastructure/Storage/DiskStorageService";
import { BugRepositoryInstance } from "@src/DataProviders/Bug/BugRepository";
import { UserRepositoryInstance } from "@src/DataProviders/User/UserRepository";
import multer from "multer";
import path from "path";

// Initialize production dependencies for BugUseCases
export const productionBugUseCases = new BugUseCases(
  GitHubIssuesServiceInstance,
  DiskStorageServiceInstance,
  BugRepositoryInstance,
  UserRepositoryInstance,
  {
    getGitHubToken: () => EnvVars.GITHUB.TOKEN,
    getGitHubManagedRepos: () => EnvVars.GITHUB.MANAGED_REPOS,
  },
);

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, "../public/uploads"));
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const productionUpload = multer({ storage });
import { isAuthenticated } from "@variamosple/variamos-security";

const bugV1Router = createBugRouter(
  productionBugUseCases,
  productionUpload,
  isAuthenticated,
);

const baseRouter = Router();

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

baseRouter.get("/version", async function (_, res) {
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

// baseRouter.get("/", async function (_, res) {
//   try {
//     const data = {
//       message: "variamos_ms_admin",
//       version: EnvVars.VERSION,
//     };

//     res.status(200).json(data);
//   } catch (error) {
//     res.status(400).send(JSON.stringify(error));
//   }
// });

export default baseRouter;
