import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import {
  SECURITY_ALERT_KEYS,
  SecurityAlertPolicy,
} from "./SecurityAlertPolicy.js";

export interface ISecurityAlertPolicyProvider {
  getPolicy(): Promise<SecurityAlertPolicy>;
}

const CACHE_MS = 60 * 1000;

/**
 * Reads the security.alerts.* keys at most once a minute: alerts watch every
 * sign-in and every administration operation, and a change on the
 * configuration screen applies within the minute. A key that cannot be read
 * takes the default.
 */
export class SecurityAlertPolicyService
  implements ISecurityAlertPolicyProvider
{
  private cached: { policy: SecurityAlertPolicy; until: number } | null = null;

  public constructor(
    private readonly configurationRepository: IConfigurationRepository,
    private readonly logger: ILogger,
    private readonly now: () => number = Date.now,
  ) {}

  private async read(key: string): Promise<unknown> {
    try {
      const response = await this.configurationRepository.queryByKey(
        new RequestModel<string>("readSecurityAlertPolicy", key),
      );
      return response.errorCode ? undefined : response.data?.value;
    } catch (error) {
      this.logger.warn(`Could not read ${key}: ${(error as Error).message}`);
      return undefined;
    }
  }

  public async getPolicy(): Promise<SecurityAlertPolicy> {
    if (this.cached && this.now() < this.cached.until) {
      return this.cached.policy;
    }
    const names = Object.keys(SECURITY_ALERT_KEYS) as Array<
      keyof typeof SECURITY_ALERT_KEYS
    >;
    const values = await Promise.all(
      names.map((name) => this.read(SECURITY_ALERT_KEYS[name])),
    );
    const policy = SecurityAlertPolicy.fromConfiguration(
      Object.fromEntries(names.map((name, i) => [name, values[i]])),
    );
    this.cached = { policy, until: this.now() + CACHE_MS };
    return policy;
  }
}
