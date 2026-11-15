import EnvVars from "#src/common/EnvVars.js";
import type { WebSettings } from "#src/EntryPoints/WebSettings.js";

/** The settings of the routes, read from the environment (EV-05). */
export const webSettingsFromEnv = (): WebSettings => ({
  auth: {
    cookie: {
      domain: EnvVars.CookieProps.Options.domain,
      path: EnvVars.CookieProps.Options.path,
      httpOnly: EnvVars.CookieProps.Options.httpOnly,
      secure: EnvVars.CookieProps.Options.secure,
      maxAge: EnvVars.CookieProps.Options.maxAge,
    },
    loginRedirectUri: EnvVars.Auth.APP.LOGIN_REDIRECT_URI,
    homeRedirectUri: EnvVars.Auth.APP.HOME_REDIRECT_URI,
    googleClientId: EnvVars.Auth.GOOGLE.CLIENT_ID,
  },
  version: EnvVars.VERSION,
  packageVersion: () => EnvVars.PackageVersion,
  isDevelopment: () => EnvVars.IsDevelopment,
});
