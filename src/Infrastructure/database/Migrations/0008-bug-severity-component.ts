import logger from "jet-logger";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

// Frozen copy of BUG_COMPONENTS at the time of this migration: a later
// change of the list needs its own migration
const COMPONENTS = ["language", "model", "microservice", "admin", "other"];

// Severity "critical" and the part of VariaMos a bug concerns (T-23,
// EV-84 lot 5). Both only add: existing rows keep their values.
const statements = (s: string) => [
  // PostgreSQL 12 and later accept it in a transaction (production runs 14)
  `ALTER TYPE "${s}"."enum_bugs_priority" ADD VALUE IF NOT EXISTS 'critical'`,
  `ALTER TABLE "${s}"."bugs" ADD COLUMN IF NOT EXISTS "component" text`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'bugs_component_check'
          AND connamespace = '"${s}"'::regnamespace
     ) THEN
       ALTER TABLE "${s}"."bugs" ADD CONSTRAINT "bugs_component_check"
         CHECK ("component" IN (${COMPONENTS.map((c) => `'${c}'`).join(", ")}));
     END IF;
   END $$`,
];

export const bugSeverityComponent: SchemaMigration = {
  name: "0008-bug-severity-component",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.transaction(async (transaction) => {
      for (const statement of statements(schema)) {
        await sequelize.query(statement, { transaction });
      }
    });
    logger.info(
      "[MIGRATION] 0008-bug-severity-component: priority critical and bugs.component ready",
    );
  },
  down: async () => {
    // PostgreSQL cannot remove a value from an enumeration
    throw new Error(
      "The bug severity and component migration cannot be reverted.",
    );
  },
};
