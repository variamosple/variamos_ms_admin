/* cspell:disable */
/**
 * Environments variables declared here.
 */

/* eslint-disable node/no-process-env */

export default {
  NodeEnv: process.env.NODE_ENV ?? "",
  Port: process.env.PORT ?? 0,
  VERSION: "1.24.10.27.08",
  DB: {
    USER: process.env.DB_USER ?? "db_user_test",
    HOST: process.env.DB_HOST ?? "db_host_test",
    PASSWORD: process.env.DB_PASSWORD ?? "db_password_test",
    DATABASE: process.env.DB_DATABASE ?? "db_database_test",
    PORT: process.env.DB_PORT ?? 5432,
    SSL: process.env.DB_SSL === "true",
  },
  CORS: {
    AllowedOriginsPatterns: (process.env.CORS_ALLOWED_ORIGINS_PATTERNS ?? "")
      .split(",")
      .map((pattern) => new RegExp(pattern)),
  },
  CookieProps: {
    Secret: process.env.COOKIE_SECRET ?? "",
    Options: {
      httpOnly: true,
      signed: true,
      path: process.env.COOKIE_PATH ?? "",
      maxAge: Number(process.env.COOKIE_EXP_IN_MS ?? 0),
      domain: process.env.COOKIE_DOMAIN ?? "",
      secure: process.env.SECURE_COOKIE === "true",
    },
  },
  Auth: {
    GOOGLE: {
      CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    },
    APP: {
      HOME_REDIRECT_URI: process.env.HOME_REDIRECT_URI,
      LOGIN_REDIRECT_URI: process.env.LOGIN_REDIRECT_URI,
      PASSWORD_RESET_EXPIRY_IN_MS: Number(
        process.env.PASSWORD_RESET_EXPIRY_IN_MS ?? 24 * 60 * 60 * 1000,
      ),
      BCRYPT_SALT_ROUNDS: Number(process.env.BCRYPT_SALT_ROUNDS ?? 10),
    },
  },
  DOCKER: {
    SOCKET_PATH: process.env.DOCKER_SOCKET_PATH ?? "",
  },
  SMTP: {
    HOST: process.env.SMTP_HOST ?? "smtp-relay.brevo.com",
    PORT: Number(process.env.SMTP_PORT ?? 587),
    USER: process.env.SMTP_USER ?? "",
    PASSWORD: process.env.SMTP_PASSWORD ?? "",
    FROM: process.env.SMTP_FROM ?? '"VariaMos" <noreply@variamos.com>',
  },
  GITHUB: {
    TOKEN: process.env.GITHUB_TOKEN ?? "",
    MANAGED_REPOS: (process.env.GITHUB_MANAGED_REPOS ?? "")
      .split(",")
      .map((repo) => repo.trim())
      .filter((repo) => repo !== ""),
    APP_ID: process.env.GITHUB_APP_ID ?? "",
    PRIVATE_KEY: process.env.GITHUB_PRIVATE_KEY ?? "",
  },
  ApiBaseUrl: process.env.API_BASE_URL ?? "http://localhost:4000",
} as const;
