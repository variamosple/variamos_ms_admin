import { Router } from "express";
import rolesV1Router, { ROLES_V1_ROUTE } from "./RolesV1Router";
import usersV1Router, { USERS_V1_ROUTE } from "./UsersV1Router";

const baseRouter = Router();

baseRouter.use(USERS_V1_ROUTE, usersV1Router);
baseRouter.use(ROLES_V1_ROUTE, rolesV1Router);

export default baseRouter;
