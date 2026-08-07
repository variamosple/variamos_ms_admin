/**
 * Remove old files, copy front-end ones.
 */

import childProcess from "child_process";
import fs from "fs-extra";
import logger from "jet-logger";

/**
 * Start
 */
(async () => {
  try {
    // Remove current build
    await remove("./dist/");
    // Copy back-end files
    await exec("tsc --build tsconfig.prod.json && npx tsc-alias -p tsconfig.prod.json", "./");
    // Verify production entrypoint exists to prevent deploy startup crashes
    if (!fs.existsSync("./dist/index.js")) {
      throw new Error("Build Error: dist/index.js was not generated. Check compilerOptions.rootDir configuration!");
    }
  } catch (err) {
    logger.err(err);
    process.exit(1);
  }
})();

/**
 * Remove file
 */
function remove(loc: string): Promise<void> {
  return new Promise((res, rej) => {
    return fs.remove(loc, (err) => {
      return !!err ? rej(err) : res();
    });
  });
}

/**
 * Copy file.
 */
function copy(src: string, dest: string): Promise<void> {
  return new Promise((res, rej) => {
    return fs.copy(src, dest, (err) => {
      return !!err ? rej(err) : res();
    });
  });
}

/**
 * Do command line command.
 */
function exec(cmd: string, loc: string): Promise<void> {
  return new Promise((res, rej) => {
    return childProcess.exec(cmd, { cwd: loc }, (err, stdout, stderr) => {
      if (!!stdout) {
        logger.info(stdout);
      }
      if (!!stderr) {
        logger.warn(stderr);
      }
      return !!err ? rej(err) : res();
    });
  });
}
