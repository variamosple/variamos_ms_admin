import { mock } from "vitest-mock-extended";
import type { Configuration } from "#src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { SECURITY_ALERT_KEYS } from "./SecurityAlertPolicy.js";
import { SecurityAlertPolicyService } from "./SecurityAlertPolicyService.js";

const answer = (value: unknown) => {
  const response = new ResponseModel<Configuration>("t");
  response.data = { value } as Configuration;
  return response;
};

describe("SecurityAlertPolicyService", () => {
  it("reads the keys once a minute at most", async () => {
    const repository = mock<IConfigurationRepository>();
    repository.queryByKey.mockImplementation(async (request) =>
      answer(request.data === SECURITY_ALERT_KEYS.failedSignInsMax ? 4 : null),
    );
    let now = 0;
    const service = new SecurityAlertPolicyService(
      repository,
      mock<ILogger>(),
      () => now,
    );

    expect((await service.getPolicy()).failedSignIns.max).toBe(4);
    const reads = repository.queryByKey.mock.calls.length;
    expect(reads).toBe(Object.keys(SECURITY_ALERT_KEYS).length);

    now = 59_000;
    await service.getPolicy();
    expect(repository.queryByKey).toHaveBeenCalledTimes(reads);

    now = 60_000;
    await service.getPolicy();
    expect(repository.queryByKey).toHaveBeenCalledTimes(2 * reads);
  });

  it("takes the default for a key it cannot read", async () => {
    const repository = mock<IConfigurationRepository>();
    repository.queryByKey.mockRejectedValue(new Error("database down"));
    const logger = mock<ILogger>();

    const policy = await new SecurityAlertPolicyService(
      repository,
      logger,
    ).getPolicy();

    expect(policy.failedSignIns.max).toBe(10);
    expect(logger.warn).toHaveBeenCalled();
  });
});
