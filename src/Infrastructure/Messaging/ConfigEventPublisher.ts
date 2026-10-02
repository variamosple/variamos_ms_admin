import type { Configuration } from "@src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigEventPublisher } from "@src/Domain/Configuration/Event/IConfigEventPublisher.js";
import logger from "jet-logger";

type ConfigUpdateListener = (config: Configuration) => void;

export class ConfigEventPublisherImpl implements IConfigEventPublisher {
  private listeners: ConfigUpdateListener[] = [];

  public addListener(listener: ConfigUpdateListener): void {
    this.listeners.push(listener);
  }

  public async publishConfigUpdated(config: Configuration): Promise<void> {
    logger.info(
      `Event config.updated published: Key = ${config.key.getValue()}, Value = ${JSON.stringify(config.value)}`,
    );
    for (const listener of this.listeners) {
      try {
        listener(config);
      } catch (err) {
        logger.err(
          `Error notifying config update listener: ${(err as Error).message}`,
        );
      }
    }
  }
}
