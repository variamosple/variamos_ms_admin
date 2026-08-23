import { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import { mock } from "vitest-mock-extended";
import { Configuration, ConfigurationKey } from "../Entity/Configuration.js";
import type { IConfigurationRepository } from "../Repository/IConfigurationRepository.js";
import {
  ConfigurationUseCase,
  type UpdateConfigurationRequest,
} from "./ConfigurationUseCase.js";

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

  it("should query by key successfully", async () => {
    const mockRepo = mock<IConfigurationRepository>();
    const useCase = new ConfigurationUseCase(mockRepo);

    const expectedConfig = Configuration.builder()
      .setKey(new ConfigurationKey("general.site_name"))
      .setValue("VariaMos")
      .setType("string")
      .setCategory("general")
      .setTargetServices(["all"])
      .build();

    mockRepo.queryByKey.mockResolvedValue(
      new ResponseModel<Configuration>("queryByKey").withResponse(
        expectedConfig,
      ),
    );

    const request = new RequestModel("queryByKey", "general.site_name");
    const response = await useCase.queryByKey(request);

    expect(response.errorCode).toBeUndefined();
    expect(response.data).toEqual(expectedConfig);
    expect(mockRepo.queryByKey).toHaveBeenCalledWith(request);
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
    expect(response.message).toBe(
      "Updating configuration 'security.password.min_length' requires MFA validation.",
    );
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
      new ResponseModel<Configuration>("queryByKey").withResponse(null),
    );

    const request = new RequestModel("updateConfiguration", {
      key: "non.existent.key",
      value: "value",
      operatorId: "admin_user",
    });

    const response = await useCase.updateConfiguration(request);

    expect(response.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
    expect(response.message).toBe(
      "Configuration with key 'non.existent.key' not found.",
    );
    expect(mockRepo.updateConfiguration).not.toHaveBeenCalled();
  });

  it("should fail update if request has no data", async () => {
    const mockRepo = mock<IConfigurationRepository>();
    const useCase = new ConfigurationUseCase(mockRepo);

    const request = new RequestModel<UpdateConfigurationRequest>(
      "updateConfiguration",
      undefined,
    );

    const response = await useCase.updateConfiguration(request);

    expect(response.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
  });

  it("should fail update if new value type is mismatched", async () => {
    const mockRepo = mock<IConfigurationRepository>();
    const useCase = new ConfigurationUseCase(mockRepo);

    const config = Configuration.builder()
      .setKey(new ConfigurationKey("general.site_name"))
      .setValue("VariaMos")
      .setType("string")
      .setCategory("general")
      .setTargetServices(["all"])
      .build();

    mockRepo.queryByKey.mockResolvedValue(
      new ResponseModel<Configuration>("queryByKey").withResponse(config),
    );

    const request = new RequestModel("updateConfiguration", {
      key: "general.site_name",
      value: 123,
      operatorId: "admin_user",
    });

    const response = await useCase.updateConfiguration(request);

    expect(response.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(response.message).toContain("must be a string");
  });

  it("should fail update if queryByKey returns an error code", async () => {
    const mockRepo = mock<IConfigurationRepository>();
    const useCase = new ConfigurationUseCase(mockRepo);

    mockRepo.queryByKey.mockResolvedValue(
      new ResponseModel<Configuration>("queryByKey").withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Database error",
      ),
    );

    const request = new RequestModel("updateConfiguration", {
      key: "general.site_name",
      value: "New Name",
      operatorId: "admin_user",
    });

    const response = await useCase.updateConfiguration(request);

    expect(response.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    expect(response.message).toBe("Database error");
    expect(mockRepo.updateConfiguration).not.toHaveBeenCalled();
  });
});
