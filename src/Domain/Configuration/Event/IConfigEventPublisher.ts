import type { Configuration } from "../Entity/Configuration.js";

export interface IConfigEventPublisher {
  publishConfigUpdated(config: Configuration): Promise<void>;
}
