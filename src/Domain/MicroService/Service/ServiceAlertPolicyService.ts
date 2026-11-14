import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import {
  SERVICE_ALERT_KEYS,
  ServiceAlertPolicy,
} from "../Entity/ServiceAlertPolicy.js";

export interface IServiceAlertPolicyProvider {
  getPolicy(): Promise<ServiceAlertPolicy>;
}

const CACHE_MS = 60 * 1000;

/**
 * Reads the monitoring.alerts.* keys at most once a minute: every health
 * check asks for them, and a change on the configuration screen applies
 * within the minute. A key that cannot be read takes the default.
 */
export class ServiceAlertPolicyService implements IServiceAlertPolicyProvider {
  private cached: { policy: ServiceAlertPolicy; until: number } | null = null;

  public constructor(
    private readonly configurationRepository: Pick<
      IConfigurationRepository,
      "queryByKey"
    >,
    private readonly logger: ILogger,
    private readonly now: () => number = Date.now,
  ) {}

  private async valueOf(key: string): Promise<unknown> {
    try {
      const response = await this.configurationRepository.queryByKey(
        new RequestModel<string>("readServiceAlertPolicy", key),
      );
      return response.errorCode ? undefined : response.data?.value;
    } catch (error) {
      this.logger.warn(`Could not read ${key}: ${errorMessage(error)}`);
      return undefined;
    }
  }

  public async getPolicy(): Promise<ServiceAlertPolicy> {
    if (this.cached && this.now() < this.cached.until) {
      return this.cached.policy;
    }
    const [recipients, failuresBeforeAlert] = await Promise.all([
      this.valueOf(SERVICE_ALERT_KEYS.recipients),
      this.valueOf(SERVICE_ALERT_KEYS.failuresBeforeAlert),
    ]);
    const policy = ServiceAlertPolicy.fromConfiguration({
      recipients,
      failuresBeforeAlert,
    });
    this.cached = { policy, until: this.now() + CACHE_MS };
    return policy;
  }
}
