/**
 * Pre-start is where we want to place things that must run BEFORE the express
 * server is started. This is useful for environment variables, command-line
 * arguments, and cron-jobs.
 */

// NOTE: DO NOT IMPORT ANY SOURCE CODE HERE
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "ts-command-line-args";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// **** Types **** //

interface IArgs {
  env: string;
}

// **** Setup **** //

// Command line arguments
const _args = parse<IArgs>({
  env: {
    type: String,
    defaultValue: "development",
    alias: "e",
  },
});

// Set the env file handled by node --env-file or defaults.
// We no longer need dotenv since node --env-file is used.
