import { Router } from "express";
import permissionsV1Router, {
  PERMISSIONS_V1_ROUTE,
} from "./PermissionsV1Router";
import rolesV1Router, { ROLES_V1_ROUTE } from "./RolesV1Router";
import usersV1Router, { USERS_V1_ROUTE } from "./UsersV1Router";

const baseRouter = Router();

baseRouter.use(USERS_V1_ROUTE, usersV1Router);
baseRouter.use(ROLES_V1_ROUTE, rolesV1Router);
baseRouter.use(PERMISSIONS_V1_ROUTE, permissionsV1Router);

export default baseRouter;
