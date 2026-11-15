import { mock } from "vitest-mock-extended";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { PASSWORD_HASHING_COST_KEY } from "#src/Domain/User/Entity/PasswordHashingCost.js";
import type { Configuration } from "../Entity/Configuration.js";
import { SITE_NAME_KEY } from "../Entity/SiteName.js";
import type { IConfigEventPublisher } from "../Event/IConfigEventPublisher.js";
import type { IConfigurationRepository } from "../Repository/IConfigurationRepository.js";
import {
  ConfigurationUseCase,
  type CreateConfigurationRequest,
} from "./ConfigurationUseCase.js";

const creation = (
  fields: Partial<CreateConfigurationRequest> = {},
): RequestModel<CreateConfigurationRequest> =>
  new RequestModel("createConfiguration", {
    key: "general.welcome_text",
    value: "Welcome",
    type: "string",
    category: "general",
    isSecret: false,
    environmentScope: "all",
    targetServices: ["variamos_ms_admin"],
    operatorId: "admin-1",
    ...fields,
  });

describe("ConfigurationUseCase.createConfiguration (EV-18 lot C.3)", () => {
  const setup = () => {
    const repository = mock<IConfigurationRepository>();
    const publisher = mock<IConfigEventPublisher>();
    const journal = { record: vi.fn().mockResolvedValue(undefined) };
    // The repository gives back what it was asked to store
    repository.createConfiguration.mockImplementation(async (request) => {
      const stored = new ResponseModel<Configuration>(request.transactionId);
      return request.data ? stored.withResponse(request.data) : stored;
    });
    return {
      repository,
      publisher,
      journal,
      useCase: new ConfigurationUseCase(repository, publisher, journal),
    };
  };

  it("stores a setting that is neither read-only nor MFA-protected", async () => {
    const { repository, publisher, useCase } = setup();

    const response = await useCase.createConfiguration(creation());

    expect(response.errorCode).toBeUndefined();
    const stored = repository.createConfiguration.mock.calls[0]?.[0].data;
    expect(stored?.key.getValue()).toBe("general.welcome_text");
    expect(stored?.isReadOnly).toBe(false);
    expect(stored?.requiresMfa).toBe(false);
    expect(stored?.updatedBy).toBe("admin-1");
    expect(publisher.publishConfigUpdated).toHaveBeenCalledWith(stored);
  });

  it("journals the creation with the value shown, a secret as its mask", async () => {
    const { journal, useCase } = setup();

    await useCase.createConfiguration(
      creation({ key: "notification.api.token", isSecret: true }),
    );

    const entry = journal.record.mock.calls[0]?.[0];
    expect(entry).toMatchObject({
      action: "configuration.create",
      entityId: "notification.api.token",
    });
    expect(JSON.stringify(entry)).not.toContain("Welcome");
  });

  it.each([
    [{ value: undefined }, "A configuration needs a value."],
    [{ type: undefined }, "A configuration needs a type and a category."],
    [{ category: undefined }, "A configuration needs a type and a category."],
    [{ key: "no dots" }, "Invalid configuration key format"],
    [{ key: undefined }, "Configuration key cannot be empty."],
    [{ type: "number" as const }, "must be a number"],
    [{ targetServices: [] }, "At least one target service is required."],
  ])("refuses %o", async (fields, message) => {
    const { repository, useCase } = setup();

    const response = await useCase.createConfiguration(creation(fields));

    expect(response.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(response.message).toContain(message);
    expect(repository.createConfiguration).not.toHaveBeenCalled();
  });

  it("refuses a value the code would replace by its default", async () => {
    const { repository, useCase } = setup();

    const response = await useCase.createConfiguration(
      creation({
        key: PASSWORD_HASHING_COST_KEY,
        type: "number",
        category: "security",
        value: 99,
      }),
    );

    expect(response.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(repository.createConfiguration).not.toHaveBeenCalled();
  });

  it("passes on a key already taken, without publishing", async () => {
    const { repository, publisher, useCase } = setup();
    repository.createConfiguration.mockResolvedValue(
      new ResponseModel<Configuration>("createConfiguration").withError(
        DomainErrorCodes.DUPLICATE_ENTITY,
        "Configuration with key 'general.welcome_text' already exists.",
      ),
    );

    const response = await useCase.createConfiguration(creation());

    expect(response.errorCode).toBe(DomainErrorCodes.DUPLICATE_ENTITY);
    expect(publisher.publishConfigUpdated).not.toHaveBeenCalled();
  });

  it("refuses a request without data", async () => {
    const { useCase } = setup();

    const response = await useCase.createConfiguration(
      new RequestModel<CreateConfigurationRequest>("createConfiguration"),
    );

    expect(response.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
  });

  it("shows a new site name at the next page opened", async () => {
    const { repository, useCase } = setup();
    repository.queryByKey.mockResolvedValue(
      new ResponseModel<Configuration>("getSiteName"),
    );
    await useCase.getSiteName();

    await useCase.createConfiguration(
      creation({ key: SITE_NAME_KEY, value: "Lab" }),
    );
    await useCase.getSiteName();

    expect(repository.queryByKey).toHaveBeenCalledTimes(2);
  });
});
