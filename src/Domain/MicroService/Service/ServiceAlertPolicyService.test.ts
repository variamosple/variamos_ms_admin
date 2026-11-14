import { mock } from "vitest-mock-extended";
import type { Configuration } from "#src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import {
  SERVICE_ALERT_KEYS,
  ServiceAlertPolicy,
} from "../Entity/ServiceAlertPolicy.js";
import { ServiceAlertPolicyService } from "./ServiceAlertPolicyService.js";

const answer = (value: unknown) => {
  const response = new ResponseModel<Configuration>("t");
  response.data = { value } as Configuration;
  return response;
};

describe("ServiceAlertPolicyService", () => {
  it("reads both keys once a minute at most", async () => {
    const repository = mock<IConfigurationRepository>();
    repository.queryByKey.mockImplementation(async (request) =>
      answer(
        request.data === SERVICE_ALERT_KEYS.recipients ? "ops@example.com" : 5,
      ),
    );
    let now = 0;
    const service = new ServiceAlertPolicyService(
      repository,
      mock<ILogger>(),
      () => now,
    );

    const policy = await service.getPolicy();
    expect(policy.recipients).toEqual(["ops@example.com"]);
    expect(policy.failuresBeforeAlert).toBe(5);
    expect(repository.queryByKey).toHaveBeenCalledTimes(2);

    now = 59_000;
    await service.getPolicy();
    expect(repository.queryByKey).toHaveBeenCalledTimes(2);

    now = 60_000;
    await service.getPolicy();
    expect(repository.queryByKey).toHaveBeenCalledTimes(4);
  });

  it("takes the default, so no alert, for a key it cannot read", async () => {
    const repository = mock<IConfigurationRepository>();
    repository.queryByKey.mockRejectedValue(new Error("database down"));
    const logger = mock<ILogger>();

    const policy = await new ServiceAlertPolicyService(
      repository,
      logger,
    ).getPolicy();

    expect(policy).toEqual(ServiceAlertPolicy.DEFAULT);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it("takes the default for a key the repository does not find", async () => {
    const repository = mock<IConfigurationRepository>();
    const missing = new ResponseModel<Configuration>("t");
    missing.withError(DomainErrorCodes.ENTITY_NOT_FOUND, "Not found");
    repository.queryByKey.mockResolvedValue(missing);

    const policy = await new ServiceAlertPolicyService(
      repository,
      mock<ILogger>(),
    ).getPolicy();

    expect(policy).toEqual(ServiceAlertPolicy.DEFAULT);
  });
});
