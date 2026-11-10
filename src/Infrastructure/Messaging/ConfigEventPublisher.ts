import logger from "#src/common/logger.js";
import type { Configuration } from "#src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigEventPublisher } from "#src/Domain/Configuration/Event/IConfigEventPublisher.js";

type ConfigUpdateListener = (config: Configuration) => void;

export class ConfigEventPublisherImpl implements IConfigEventPublisher {
  private listeners: ConfigUpdateListener[] = [];

  public addListener(listener: ConfigUpdateListener): void {
    this.listeners.push(listener);
  }

  public async publishConfigUpdated(config: Configuration): Promise<void> {
    // The value of a secret arrives decrypted: only its mask is written (T-13)
    logger.info(
      `Event config.updated published: Key = ${config.key.getValue()}, Value = ${JSON.stringify(config.getDisplayValue())}`,
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
