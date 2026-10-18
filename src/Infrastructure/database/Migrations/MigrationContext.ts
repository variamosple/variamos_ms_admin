import type { Sequelize } from "sequelize";
import type { RunnableMigration } from "umzug";

export interface MigrationContext {
  sequelize: Sequelize;
  // DB_SCHEMA: migrations never name a schema themselves
  schema: string;
}

export type SchemaMigration = RunnableMigration<MigrationContext>;
