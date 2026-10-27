import jetLogger from "jet-logger";

/**
 * The only door to jet-logger (dependency-cruiser rule). Since version 3,
 * jet-logger prints objects in full: an axios error would show its request
 * headers, a Sequelize error its query and parameters. Each entry is turned
 * into text first, as version 2 did: an error gives its name and message, an
 * object "[object Object]".
 */
const logger = {
  info: (content: unknown) => jetLogger.info(String(content)),
  imp: (content: unknown) => jetLogger.imp(String(content)),
  warn: (content: unknown) => jetLogger.warn(String(content)),
  err: (content: unknown) => jetLogger.err(String(content)),
};

export default logger;
