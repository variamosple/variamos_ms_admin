import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import {
  PASSWORD_HASHING_COST_KEY,
  passwordHashingCostOf,
} from "#src/Domain/User/Entity/PasswordHashingCost.js";
import type { IPasswordHashingCostProvider } from "./IPasswordHasher.js";

/**
 * Reads security.bcrypt_salt_rounds at each use, so that a change on the
 * configuration screen applies from the next password (EV-51). A key that
 * cannot be read, or a value out of bounds, gives the cost of the
 * environment (BCRYPT_SALT_ROUNDS), then the default.
 */
export class PasswordHashingCostService
  implements IPasswordHashingCostProvider
{
  public constructor(
    private readonly configurationRepository: Pick<
      IConfigurationRepository,
      "queryByKey"
    >,
    private readonly costFromEnvironment: number,
  ) {}

  private async readConfigured(): Promise<unknown> {
    try {
      const response = await this.configurationRepository.queryByKey(
        new RequestModel<string>(
          "readPasswordHashingCost",
          PASSWORD_HASHING_COST_KEY,
        ),
      );
      return response.errorCode ? undefined : response.data?.value;
    } catch {
      // The repository logs its own failures; the fallback cost applies
      return undefined;
    }
  }

  public async getCost(): Promise<number> {
    return passwordHashingCostOf(
      await this.readConfigured(),
      this.costFromEnvironment,
    );
  }
}
