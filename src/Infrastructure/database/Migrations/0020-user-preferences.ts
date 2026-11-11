import logger from "#src/common/logger.js";
import type { SchemaMigration } from "./MigrationContext.js";

// 0020 was to create "user_preferences" (EV-115 lot C), a name the
// notifications service already gives to its own table in the shared
// schema: in production, CREATE TABLE IF NOT EXISTS changed nothing. It now
// does nothing anywhere, so that it never takes that name on a new database,
// and going back never drops the table of the notifications. 0021 creates
// the table of the admin under another name.
export const retiredUserPreferences: SchemaMigration = {
  name: "0020-user-preferences",
  up: async () => {
    logger.info("[MIGRATION] 0020-user-preferences: retired, nothing to do");
  },
  down: async () => {
    // Nothing was created: nothing to drop
  },
};
