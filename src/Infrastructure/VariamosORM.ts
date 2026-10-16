import logger from "jet-logger";
import { Sequelize } from "sequelize";
import EnvVars from "#src/common/EnvVars.js";
import { NodeEnvs } from "#src/common/misc.js";

// Generated SQL holds values written inline (e-mail addresses, identifiers):
// it is logged only in development, never in test or production.
const logSql =
  EnvVars.NodeEnv === NodeEnvs.Dev.valueOf()
    ? (sql: string) => logger.info(sql)
    : false;

const VARIAMOS_ORM = new Sequelize(
  EnvVars.DB.DATABASE,
  EnvVars.DB.USER,
  EnvVars.DB.PASSWORD,
  {
    host: EnvVars.DB.HOST,
    dialect: "postgres",
    logging: logSql,
    pool: {
      max: 20,
      min: 2,
      acquire: 10000,
      idle: 10000,
    },
    dialectOptions: {
      ssl: EnvVars.DB.SSL,
    },
    define: {
      charset: "utf8",
      collate: "utf8_general_ci",
      timestamps: true,
    },
  },
);
export const DB_SCHEMA = EnvVars.DB.SCHEMA;
export default VARIAMOS_ORM;
