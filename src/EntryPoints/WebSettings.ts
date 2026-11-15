import type { AuthWebSettings } from "./authWeb.js";

/**
 * What the routes read from the configuration (EV-05). The composition
 * root builds it from the environment; the routes never read EnvVars, so a
 * test gives them its own settings instead of changing process.env.
 */
export interface WebSettings {
  auth: AuthWebSettings;
  /** The version /version gives. */
  version: string;
  /** The version /health gives; npm sets it when it starts the service. */
  packageVersion: () => string;
  /** Whether the menu points to the local sites; read on each request. */
  isDevelopment: () => boolean;
}
