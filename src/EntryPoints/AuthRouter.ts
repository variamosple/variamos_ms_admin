import { Router } from "express";
import { addAccountRoutes } from "./AuthAccountRoutes.js";
import { addGoogleRoutes } from "./AuthGoogleRoutes.js";
import { addSessionRoutes } from "./AuthSessionRoutes.js";
import { addSignInRoutes } from "./AuthSignInRoutes.js";
import type { AuthRouterDependencies } from "./authContext.js";
import { createAuthWeb } from "./authWeb.js";

export { AUTH_ROUTE } from "./authContext.js";

/**
 * The authentication routes. The cookie and redirection helpers are made
 * here, from the settings the composition root gives (EV-05).
 */
export function createAuthRouter(dependencies: AuthRouterDependencies): Router {
  const ctx = {
    ...dependencies,
    ...createAuthWeb(dependencies.web, dependencies.sessions),
  };
  const authRouter = Router();
  addSessionRoutes(authRouter, ctx);
  addSignInRoutes(authRouter, ctx);
  addGoogleRoutes(authRouter, ctx);
  addAccountRoutes(authRouter, ctx);
  return authRouter;
}
