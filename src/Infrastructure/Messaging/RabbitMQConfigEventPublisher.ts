import type { Configuration } from "@src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigEventPublisher } from "@src/Domain/Configuration/Event/IConfigEventPublisher.js";
import amqp from "amqplib";
import logger from "jet-logger";

export class RabbitMQConfigEventPublisher implements IConfigEventPublisher {
  private readonly brokerUrl: string;
  private readonly exchangeName = "config.events";

  constructor(brokerUrl: string) {
    this.brokerUrl = brokerUrl;
  }

  public async publishConfigUpdated(config: Configuration): Promise<void> {
    let connection: amqp.ChannelModel | null = null;
    let channel: amqp.Channel | null = null;

    try {
      connection = await amqp.connect(this.brokerUrl);
      channel = await connection.createChannel();

      // Ensure the exchange exists (Topic exchange allows complex routing keys)
      await channel.assertExchange(this.exchangeName, "topic", {
        durable: true,
      });

      const payload = {
        key: config.key.getValue(),
        value: config.value,
        type: config.type,
        category: config.category,
        environmentScope: config.environmentScope,
        targetServices: config.targetServices,
        updatedAt: config.updatedAt ?? new Date(),
        updatedBy: config.updatedBy,
      };

      // Mask sensitive configurations in the payload to prevent leakage over broker topics
      if (config.isSecret) {
        payload.value = "********";
      }

      const routingKey = "config.updated";
      const messageBuffer = Buffer.from(JSON.stringify(payload));

      channel.publish(this.exchangeName, routingKey, messageBuffer, {
        persistent: true, // Keep the message persistent on disk
      });

      logger.info(
        `[RabbitMQConfigEventPublisher] Published config.updated event for key: ${config.key.getValue()}`,
      );
    } catch (error) {
      logger.err(
        `[RabbitMQConfigEventPublisher] Failed to publish event: ${error}`,
      );
    } finally {
      if (channel) {
        await channel.close().catch(() => {});
      }
      if (connection) {
        await connection.close().catch(() => {});
      }
    }
  }
}
