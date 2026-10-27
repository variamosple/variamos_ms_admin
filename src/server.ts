/**
 * Setup express server.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from "express";
import helmet from "helmet";
import logger from "jet-logger";
import morgan from "morgan";
import { RouteError } from "#src/common/classes.js";
import { describeError } from "#src/common/describeError.js";
import EnvVars from "#src/common/EnvVars.js";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { NodeEnvs } from "#src/common/misc.js";
import {
  errorResponse,
  hideInternalErrorMessages,
} from "#src/EntryPoints/errorResponse.js";
import { createUploadsRouter } from "#src/EntryPoints/UploadsRouter.js";

export function createServer(baseRouter: Router) {
  const app = express();
  // helmet removes it too; disabled here so that it never comes back
  app.disable("x-powered-by");

  // nginx, on the Docker network, appends the client address to
  // X-Forwarded-For: trust private hops only, so req.ip is the client and an
  // address forged by the client is ignored (rate limits are per address).
  app.set("trust proxy", "loopback, linklocal, uniquelocal");

  // **** Setup **** //

  // A server error never sends its own message to the client (T-16)
  app.use(hideInternalErrorMessages);

  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser(EnvVars.CookieProps.Secret));

  const corsOptions = {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || "null" === origin) return callback(null, true);

      const isAllowed =
        EnvVars.CORS.AllowedOriginsPatterns.findIndex((pattern) =>
          pattern.test(origin),
        ) !== -1;

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(
          new RouteError(HttpStatusCodes.FORBIDDEN, "Origin not allowed."),
        );
      }
    },
    credentials: true,
  };

  app.use(cors(corsOptions));

  // Show routes called in console during development
  if (EnvVars.NodeEnv === NodeEnvs.Dev.valueOf()) {
    app.use(morgan("dev"));
  }

  // Security headers in every environment, so that development and the
  // tests run with what production sends (EV-75 lot 4)
  app.use(helmet());

  // Uploaded files are served by a dedicated route, never as static content
  const uploadsDir = path.join(__dirname, "public/uploads");
  app.use("/uploads", createUploadsRouter(uploadsDir));

  // Add APIs, must be after middleware
  app.use("/", baseRouter);

  // Add error handler: only a DomainError or a RouteError shows its message
  app.use((err: Error, _: Request, res: Response, _next: NextFunction) => {
    if (EnvVars.NodeEnv !== NodeEnvs.Test.valueOf()) {
      logger.err(describeError(err));
    }
    const { status, body } = errorResponse(err);
    return res.status(status).json(body);
  });

  // **** Front-End Content **** //

  // Set views directory (html)
  const viewsDir = path.join(__dirname, "views");
  app.set("views", viewsDir);

  return app;
}
