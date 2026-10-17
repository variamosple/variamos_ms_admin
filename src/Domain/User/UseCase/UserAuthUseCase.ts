import crypto from "node:crypto";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { IGuestRoleRepository } from "#src/Domain/Role/Repository/IGuestRoleRepository.js";
import type { Credentials } from "#src/Domain/User/Entity/Credentials.js";
import { User } from "#src/Domain/User/Entity/User.js";
import { UserRegistration } from "#src/Domain/User/Entity/UserRegistration.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";
import {
  checkNewPassword,
  DEFAULT_PASSWORD_POLICY_PROVIDER,
  type IPasswordPolicyProvider,
} from "#src/Domain/User/Service/PasswordPolicyService.js";

export class UserAuthUseCase {
  public constructor(
    private readonly userRepository: IUserRepository,
    private readonly roleRepository: IGuestRoleRepository,
    private readonly passwordPolicy: IPasswordPolicyProvider = DEFAULT_PASSWORD_POLICY_PROVIDER,
  ) {}

  public async signUp(
    request: RequestModel<UserRegistration>,
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);
    const data = request.data;

    try {
      if (!data) {
        throw new Error(
          "Full name, Email and password, and password confirmation are required.",
        );
      }
      UserRegistration.builder()
        .setName(data.name)
        .setEmail(data.email)
        .setPassword(data.password)
        .setPasswordConfirmation(data.passwordConfirmation)
        .build();
    } catch (error) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        (error as Error).message,
      );
    }

    const refusal = await checkNewPassword(
      this.passwordPolicy,
      data.password,
      "Sign-up",
    );
    if (refusal) {
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, refusal);
    }

    return this.userRepository.signUp(request);
  }

  public async signIn(
    request: RequestModel<Credentials>,
  ): Promise<ResponseModel<User>> {
    return this.userRepository.signIn(request);
  }

  public async findOrCreate(
    request: RequestModel<User>,
  ): Promise<ResponseModel<User>> {
    return this.userRepository.findOrCreateUser(request);
  }

  public async getGuestData(
    request: RequestModel<string>,
  ): Promise<ResponseModel<User>> {
    let guestId = request.data || crypto.randomUUID();
    let userExists: boolean;
    const response = new ResponseModel<User>(request.transactionId);

    do {
      const existsResponse = await this.userRepository.userExists(
        new RequestModel<string>(request.transactionId, guestId),
      );

      if (existsResponse.errorCode) {
        return response.copyErrorWithPromise(existsResponse);
      }

      if (existsResponse.data) {
        guestId = crypto.randomUUID();
      }

      userExists = existsResponse.data === true;
    } while (userExists);

    const role = await this.roleRepository.queryGuestRole(
      new RequestModel<void>(request.transactionId),
    );
    const roles = role.data ? [role.data.name] : [];
    const permissions = role.data?.permissions
      ? role.data.permissions.map((permission) => permission.name)
      : [];

    response.data = User.builder()
      .setId(guestId)
      .setName("Guest")
      .setUser("Guest")
      .setEmail("guest@variamos.com")
      .setRoles(roles)
      .setPermissions(permissions)
      .build();

    return response;
  }
}
