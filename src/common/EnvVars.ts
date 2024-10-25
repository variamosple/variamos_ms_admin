/**
 * Environments variables declared here.
 */

/* eslint-disable node/no-process-env */

export default {
  NodeEnv: process.env.NODE_ENV ?? "",
  Port: process.env.PORT ?? 0,
  VERSION: "1.24.04.14.14",
  DB: {
    USER: process.env.DB_USER ?? "db_user_test",
    HOST: process.env.DB_HOST ?? "db_host_test",
    PASSWORD: process.env.DB_PASSWORD ?? "db_password_test",
    DATABASE: process.env.DB_DATABASE ?? "db_database_test",
    PORT: process.env.DB_PORT ?? 5432,
    SSL: process.env.DB_SSL === "true",
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
      REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    },
  },
} as const;
