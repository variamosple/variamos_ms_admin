import { Router } from "express";
import { addAccountRoutes } from "./AuthAccountRoutes.js";
import { addGoogleRoutes } from "./AuthGoogleRoutes.js";
import { addSessionRoutes } from "./AuthSessionRoutes.js";
import { addSignInRoutes } from "./AuthSignInRoutes.js";
import type { AuthRouterDependencies } from "./authContext.js";
import { createAuthWeb } from "./authWeb.js";

export { AUTH_ROUTE } from "./authContext.js";

/**
 * The authentication routes. The helpers that read the home address are
 * made here, when the router is created.
 */
export function createAuthRouter(dependencies: AuthRouterDependencies): Router {
  const ctx = { ...dependencies, ...createAuthWeb() };
  const authRouter = Router();
  addSessionRoutes(authRouter, ctx);
  addSignInRoutes(authRouter, ctx);
  addGoogleRoutes(authRouter, ctx);
  addAccountRoutes(authRouter, ctx);
  return authRouter;
}
