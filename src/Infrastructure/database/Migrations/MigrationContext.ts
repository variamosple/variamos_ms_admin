import type { Sequelize } from "sequelize";
import type { RunnableMigration } from "umzug";

export interface MigrationContext {
  sequelize: Sequelize;
  // DB_SCHEMA: migrations never name a schema themselves
  schema: string;
}

export type SchemaMigration = RunnableMigration<MigrationContext>;

/**
 * The rollback of a migration that cannot be undone: it refuses, naming the
 * migration, instead of losing data or leaving the schema half reverted.
 */
export const refuseRollback = (subject: string) => (): Promise<never> =>
  Promise.reject(new Error(`The ${subject} migration cannot be reverted.`));
