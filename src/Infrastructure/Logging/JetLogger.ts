import logger from "jet-logger";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";

/** jet-logger behind the domain port (T-18 lot 3d). */
export const JetLogger: ILogger = logger;
