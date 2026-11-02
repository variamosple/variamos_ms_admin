import logger from "#src/common/logger.js";
import type { MigrationContext, SchemaMigration } from "./MigrationContext.js";

export const BUG_ISSUE_INDEX = "bugs_github_repo_issue_number_key";

// One bug per GitHub issue (EV-101). The synchronization looks the issue up
// before it creates the bug; two runs at once could still both create it.
// A bug without an issue (number NULL) is not concerned: PostgreSQL never
// counts two NULLs as equal. Production held no duplicate on 2026-11-02.
const statement = (s: string) =>
  `CREATE UNIQUE INDEX IF NOT EXISTS "${BUG_ISSUE_INDEX}"
     ON "${s}"."bugs" ("github_repo", "git_issue_number")`;

export const bugIssueUniqueIndex: SchemaMigration = {
  name: "0013-bug-issue-unique-index",
  up: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.query(statement(schema));
    logger.info(
      "[MIGRATION] 0013-bug-issue-unique-index: one bug per GitHub issue",
    );
  },
  down: async ({ context }: { context: MigrationContext }) => {
    const { sequelize, schema } = context;
    await sequelize.query(
      `DROP INDEX IF EXISTS "${schema}"."${BUG_ISSUE_INDEX}"`,
    );
  },
};
