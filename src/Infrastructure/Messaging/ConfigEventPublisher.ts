import type { Configuration } from "@src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigEventPublisher } from "@src/Domain/Configuration/Event/IConfigEventPublisher.js";
import logger from "jet-logger";

export class ConfigEventPublisherImpl implements IConfigEventPublisher {
  public async publishConfigUpdated(config: Configuration): Promise<void> {
    logger.info(
      `Event config.updated published: Key = ${config.key.getValue()}, Value = ${JSON.stringify(config.value)}`,
    );
  }
}
