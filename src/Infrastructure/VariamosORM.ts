import EnvVars from "@src/common/EnvVars";
import { Sequelize } from "sequelize";

const VARIAMOS_ORM = new Sequelize(
  EnvVars.DB.DATABASE,
  EnvVars.DB.USER,
  EnvVars.DB.PASSWORD,
  {
    host: EnvVars.DB.HOST,
    dialect: "postgres",
    pool: {
      max: 5,
      min: 0,
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
  }
);
export default VARIAMOS_ORM;
