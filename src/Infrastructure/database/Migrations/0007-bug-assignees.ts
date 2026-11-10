import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

export const BUG_ASSIGNEES_TABLE = "bug_assignees";

const table = (s: string) => `"${s}"."${BUG_ASSIGNEES_TABLE}"`;

// Administrators assigned to a bug (T-23, EV-84 lot 3). A row goes with its
// bug or its account; the one who assigned is kept when known.
const statements = (s: string) => [
  `CREATE TABLE IF NOT EXISTS ${table(s)} (
    "bug_id" uuid NOT NULL,
    "user_id" text NOT NULL,
    "assigned_by" text,
    "assigned_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "bug_assignees_pkey" PRIMARY KEY ("bug_id", "user_id"),
    CONSTRAINT "bug_assignees_bug_id_fkey" FOREIGN KEY ("bug_id")
      REFERENCES "${s}"."bugs" ("id") ON DELETE CASCADE,
    CONSTRAINT "bug_assignees_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "${s}"."user" ("id") ON DELETE CASCADE,
    CONSTRAINT "bug_assignees_assigned_by_fkey" FOREIGN KEY ("assigned_by")
      REFERENCES "${s}"."user" ("id") ON DELETE SET NULL
  )`,
  // "Assigned to" filter of the bug list
  `CREATE INDEX IF NOT EXISTS "bug_assignees_user_idx"
     ON ${table(s)} ("user_id")`,
];

export const bugAssignees: SchemaMigration = {
  name: "0007-bug-assignees",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.transaction(async (transaction) => {
      for (const statement of statements(schema)) {
        await sequelize.query(statement, { transaction });
      }
    });
    logger.info(
      `[MIGRATION] 0007-bug-assignees: table ${BUG_ASSIGNEES_TABLE} ready`,
    );
  },
  down: async () => {
    // Reverting would drop every assignment
    throw new Error("The bug assignees migration cannot be reverted.");
  },
};
