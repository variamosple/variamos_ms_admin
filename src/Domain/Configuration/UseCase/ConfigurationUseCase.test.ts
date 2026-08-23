import { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import { mock } from "vitest-mock-extended";
import { Configuration, ConfigurationKey } from "../Entity/Configuration.js";
import type { IConfigurationRepository } from "../Repository/IConfigurationRepository.js";
import { ConfigurationUseCase } from "./ConfigurationUseCase.js";

describe("ConfigurationUseCase Unit Tests", () => {
  it("should query configurations successfully", async () => {
    const mockRepo = mock<IConfigurationRepository>();
    const useCase = new ConfigurationUseCase(mockRepo);

    const expectedConfigs = [
      Configuration.builder()
        .setKey(new ConfigurationKey("general.site_name"))
        .setValue("VariaMos")
        .setType("string")
        .setCategory("general")
        .setTargetServices(["all"])
        .build(),
    ];

    mockRepo.queryConfigurations.mockResolvedValue(
      new ResponseModel<Configuration[]>("queryConfigurations").withResponse(
        expectedConfigs,
      ),
    );

    const request = new RequestModel("queryConfigurations", {});
    const response = await useCase.queryConfigurations(request);

    expect(response.errorCode).toBeUndefined();
    expect(response.data).toEqual(expectedConfigs);
    expect(mockRepo.queryConfigurations).toHaveBeenCalledWith(request);
  });

  it("should block update if MFA is required and not validated", async () => {
    const mockRepo = mock<IConfigurationRepository>();
    const useCase = new ConfigurationUseCase(mockRepo);

    const sensitiveConfig = Configuration.builder()
      .setKey(new ConfigurationKey("security.password.min_length"))
      .setValue(12)
      .setType("number")
      .setCategory("security")
      .setRequiresMfa(true)
      .setTargetServices(["variamos_ms_security"])
      .build();

    mockRepo.queryByKey.mockResolvedValue(
      new ResponseModel<Configuration>("queryByKey").withResponse(
        sensitiveConfig,
      ),
    );

    const request = new RequestModel("updateConfiguration", {
      key: "security.password.min_length",
      value: 14,
      operatorId: "admin_user",
      isMfaVerified: false, // MFA not verified!
    });

    const response = await useCase.updateConfiguration(request);

    expect(response.errorCode).toBe(DomainErrorCodes.MFA_REQUIRED);
    expect(mockRepo.updateConfiguration).not.toHaveBeenCalled();
  });

  it("should allow update if MFA is required and validated", async () => {
    const mockRepo = mock<IConfigurationRepository>();
    const useCase = new ConfigurationUseCase(mockRepo);

    const sensitiveConfig = Configuration.builder()
      .setKey(new ConfigurationKey("security.password.min_length"))
      .setValue(12)
      .setType("number")
      .setCategory("security")
      .setRequiresMfa(true)
      .setTargetServices(["variamos_ms_security"])
      .build();

    mockRepo.queryByKey.mockResolvedValue(
      new ResponseModel<Configuration>("queryByKey").withResponse(
        sensitiveConfig,
      ),
    );

    const updatedConfig = Configuration.builder()
      .setKey(new ConfigurationKey("security.password.min_length"))
      .setValue(14)
      .setType("number")
      .setCategory("security")
      .setRequiresMfa(true)
      .setTargetServices(["variamos_ms_security"])
      .setUpdatedBy("admin_user")
      .build();

    mockRepo.updateConfiguration.mockResolvedValue(
      new ResponseModel<Configuration>("updateConfiguration").withResponse(
        updatedConfig,
      ),
    );

    const request = new RequestModel("updateConfiguration", {
      key: "security.password.min_length",
      value: 14,
      operatorId: "admin_user",
      isMfaVerified: true, // MFA verified!
    });

    const response = await useCase.updateConfiguration(request);

    expect(response.errorCode).toBeUndefined();
    expect(response.data?.value).toBe(14);
    expect(mockRepo.updateConfiguration).toHaveBeenCalled();
  });

  it("should fail update if key does not exist", async () => {
    const mockRepo = mock<IConfigurationRepository>();
    const useCase = new ConfigurationUseCase(mockRepo);

    mockRepo.queryByKey.mockResolvedValue(
      new ResponseModel<Configuration>("queryByKey").withError(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Not found",
      ),
    );

    const request = new RequestModel("updateConfiguration", {
      key: "non.existent.key",
      value: "value",
      operatorId: "admin_user",
    });

    const response = await useCase.updateConfiguration(request);

    expect(response.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
    expect(mockRepo.updateConfiguration).not.toHaveBeenCalled();
  });
});
