import type { ActivityValues } from "#src/Domain/Activity/ActivityEntry.js";
import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
import { refusalOfConfigurationValue } from "../Entity/AppliedConfigurationKeys.js";
import type {
  Configuration,
  ConfigurationValue,
} from "../Entity/Configuration.js";
import { SITE_NAME_KEY, siteNameOf } from "../Entity/SiteName.js";
import type { IConfigEventPublisher } from "../Event/IConfigEventPublisher.js";
import type {
  ConfigurationFilter,
  IConfigurationRepository,
} from "../Repository/IConfigurationRepository.js";

export interface UpdateConfigurationRequest {
  key: string;
  // Missing when the body has none: updateValue refuses it
  value: ConfigurationValue | undefined;
  operatorId: string;
}

/**
 * How long the site name is kept in memory: the route that gives it needs no
 * sign-in, so the database is read once a minute at most, whatever comes in.
 */
export const SITE_NAME_CACHE_MS = 60 * 1000;

export class ConfigurationUseCase {
  private cachedSiteName?: { name: string; readAt: number };

  public constructor(
    private readonly configurationRepository: IConfigurationRepository,
    private readonly configEventPublisher: IConfigEventPublisher,
    private readonly journal: IActivityJournal,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * The name the browser tabs show (EV-87 lot 2). A key that cannot be read,
   * or a value the tabs cannot show, gives VariaMos; a failed read is kept
   * the same minute, so that a database in trouble is not read more often.
   */
  public async getSiteName(): Promise<string> {
    const cached = this.cachedSiteName;
    if (cached && this.now() - cached.readAt < SITE_NAME_CACHE_MS) {
      return cached.name;
    }
    let configured: unknown;
    try {
      const response = await this.configurationRepository.queryByKey(
        new RequestModel<string>("getSiteName", SITE_NAME_KEY),
      );
      configured = response.data?.value;
    } catch {
      // The repository logs its own failures; the default applies
    }
    const name = siteNameOf(configured);
    this.cachedSiteName = { name, readAt: this.now() };
    return name;
  }

  public async queryConfigurations(
    request: RequestModel<ConfigurationFilter>,
  ): Promise<ResponseModel<Configuration[]>> {
    return await this.configurationRepository.queryConfigurations(request);
  }

  public async queryByKey(
    request: RequestModel<string>,
  ): Promise<ResponseModel<Configuration>> {
    return await this.configurationRepository.queryByKey(request);
  }

  public async updateConfiguration(
    request: RequestModel<UpdateConfigurationRequest>,
  ): Promise<ResponseModel<Configuration>> {
    // Display values: a secret is kept as its mask, never in clear (T-13)
    let change: { before: ActivityValues; after: ActivityValues } | undefined;
    return await withJournal(
      this.journal,
      {
        actorId: request.data?.operatorId,
        action: "configuration.update",
        entityType: "configuration",
        entityId: request.data?.key,
        transactionId: request.transactionId,
      },
      () =>
        this.applyUpdate(request, (before, after) => {
          change = { before: { value: before }, after: { value: after } };
        }),
      () => change ?? {},
    );
  }

  private async applyUpdate(
    request: RequestModel<UpdateConfigurationRequest>,
    onChange: (before: ConfigurationValue, after: ConfigurationValue) => void,
  ): Promise<ResponseModel<Configuration>> {
    const transactionId = request.transactionId;
    const response = new ResponseModel<Configuration>(transactionId);

    if (!request.data) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "Request data is required.",
      );
    }

    const { key, value, operatorId } = request.data;

    // 1. Fetch current configuration to check its security metadata
    const queryRequest = new RequestModel<string>(transactionId, key);
    const existingConfigResponse =
      await this.configurationRepository.queryByKey(queryRequest);

    if (existingConfigResponse.errorCode) {
      return response.copyErrorWithPromise(existingConfigResponse);
    }

    const configuration = existingConfigResponse.data;
    if (!configuration) {
      return response.withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        `Configuration with key '${key}' not found.`,
      );
    }

    // 2. MFA-protected keys need a server-side proof, which does not exist
    // yet (T-10, two-factor authentication spec of 2026-10-17)
    if (configuration.requiresMfa) {
      return response.withError(
        DomainErrorCodes.MFA_REQUIRED,
        `Updating configuration '${key}' requires MFA validation.`,
      );
    }

    // 3. A value the code would replace by its default is refused (EV-18)
    const refusal = refusalOfConfigurationValue(key, value);
    if (refusal) {
      return response.withError(DomainErrorCodes.INVALID_INPUT, refusal);
    }

    // 4. Mutate domain entity state (validates type invariants and readonly flag)
    const before = configuration.getDisplayValue();
    try {
      configuration.updateValue(value, operatorId);
    } catch (e) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        errorMessage(e),
      );
    }

    // 5. Persist updated configuration
    // The value updateValue accepted, missing no more
    const updateRequest = new RequestModel(transactionId, {
      key,
      value: configuration.value,
      operatorId,
    });
    const updateResponse =
      await this.configurationRepository.updateConfiguration(updateRequest);

    if (!updateResponse.errorCode) {
      onChange(before, configuration.getDisplayValue());
      // A new site name shows at the next page opened, not a minute later
      if (key === SITE_NAME_KEY) this.cachedSiteName = undefined;
    }

    // 6. Publish config updated event on success
    if (!updateResponse.errorCode && updateResponse.data) {
      await this.configEventPublisher.publishConfigUpdated(updateResponse.data);
    }

    return updateResponse;
  }
}
