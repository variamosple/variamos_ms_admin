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
    Key: "ExpressGeneratorTs",
    Secret: process.env.COOKIE_SECRET ?? "",
    // Casing to match express cookie options
    Options: {
      httpOnly: true,
      signed: true,
      path: process.env.COOKIE_PATH ?? "",
      maxAge: Number(process.env.COOKIE_EXP ?? 0),
      domain: process.env.COOKIE_DOMAIN ?? "",
      secure: process.env.SECURE_COOKIE === "true",
    },
  },
  Jwt: {
    Secret: process.env.JWT_SECRET ?? "",
    Exp: process.env.COOKIE_EXP ?? "", // exp at the same time as the cookie
  },
} as const;
