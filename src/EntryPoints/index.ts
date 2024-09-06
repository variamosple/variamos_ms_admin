import { Router } from "express";
import usersV1Router, { USERS_V1_ROUTE } from "./UsersV1Router";

const baseRouter = Router();

baseRouter.use(USERS_V1_ROUTE, usersV1Router);

export default baseRouter;
