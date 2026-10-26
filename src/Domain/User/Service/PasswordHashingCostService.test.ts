import { mock } from "vitest-mock-extended";
import type { Configuration } from "#src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { PasswordHashingCostService } from "./PasswordHashingCostService.js";

const answering = (value: unknown) => {
  const repository = mock<IConfigurationRepository>();
  repository.queryByKey.mockResolvedValue(
    new ResponseModel<Configuration>("t").withResponse({
      value,
    } as Configuration),
  );
  return repository;
};

describe("PasswordHashingCostService", () => {
  it("reads security.bcrypt_salt_rounds at each call", async () => {
    const repository = answering(12);
    const service = new PasswordHashingCostService(repository, 10);

    expect(await service.getCost()).toBe(12);
    repository.queryByKey.mockResolvedValue(
      new ResponseModel<Configuration>("t").withResponse({
        value: 13,
      } as Configuration),
    );
    expect(await service.getCost()).toBe(13);
    expect(repository.queryByKey.mock.calls[0]?.[0].data).toBe(
      "security.bcrypt_salt_rounds",
    );
  });

  it("takes the environment cost when the key is missing", async () => {
    const repository = mock<IConfigurationRepository>();
    repository.queryByKey.mockResolvedValue(
      new ResponseModel<Configuration>("t").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "missing",
      ),
    );

    expect(await new PasswordHashingCostService(repository, 11).getCost()).toBe(
      11,
    );
  });

  it("takes the environment cost when the configuration cannot be read", async () => {
    const repository = mock<IConfigurationRepository>();
    repository.queryByKey.mockRejectedValue(new Error("database down"));

    expect(await new PasswordHashingCostService(repository, 11).getCost()).toBe(
      11,
    );
  });

  it("ignores a configured cost out of bounds", async () => {
    expect(
      await new PasswordHashingCostService(answering(4), 11).getCost(),
    ).toBe(11);
  });
});
