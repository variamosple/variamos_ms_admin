import EnvVars from "@src/common/EnvVars";
import { Router } from "express";
import authRouter, { AUTH_ROUTE } from "./AuthRouter";
import permissionsV1Router, {
  PERMISSIONS_V1_ROUTE,
} from "./PermissionsV1Router";
import rolesV1Router, { ROLES_V1_ROUTE } from "./RolesV1Router";
import usersV1Router, { USERS_V1_ROUTE } from "./UsersV1Router";

const baseRouter = Router();

baseRouter.use(AUTH_ROUTE, authRouter);
baseRouter.use(USERS_V1_ROUTE, usersV1Router);
baseRouter.use(ROLES_V1_ROUTE, rolesV1Router);
baseRouter.use(PERMISSIONS_V1_ROUTE, permissionsV1Router);

baseRouter.get("/", async function (_, res) {
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

export default baseRouter;
