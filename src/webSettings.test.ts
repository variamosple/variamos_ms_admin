import EnvVars from "#src/common/EnvVars.js";
import { webSettingsFromEnv } from "./webSettings.js";

// The routes read these settings instead of EnvVars (EV-05): the session
// cookie and the redirects must stay exactly what EnvVars gave
describe("webSettingsFromEnv", () => {
  it("copies the cookie options and the pages of VariaMosAdmin", () => {
    expect(webSettingsFromEnv().auth).toEqual({
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
    });
  });

  it("reads the development flag and the package version on each call", () => {
    const settings = webSettingsFromEnv();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("npm_package_version", "9.9.9");

    expect(settings.isDevelopment()).toBe(true);
    expect(settings.packageVersion()).toBe("9.9.9");
    expect(settings.version).toBe(EnvVars.VERSION);

    vi.unstubAllEnvs();
    expect(settings.isDevelopment()).toBe(false);
  });
});
