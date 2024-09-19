import logger from "jet-logger";
import "./pre-start"; // Must be the first import

import EnvVars from "@src/common/EnvVars";
import { initKeyStore } from "@variamos/variamos-security";
import server from "./server";

// **** Run **** //

const SERVER_START_MSG =
  "Express server started on port: " + EnvVars.Port.toString();

server.listen(EnvVars.Port, () => {
  initKeyStore().then();
  logger.info(SERVER_START_MSG);
});
