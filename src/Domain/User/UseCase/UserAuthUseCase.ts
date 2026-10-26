import crypto from "node:crypto";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
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

/** Where the notice to the owner of a taken address points. */
export interface UserAuthUseCaseConfig {
  adminHomeUri: string;
}

export class UserAuthUseCase {
  public constructor(
    private readonly userRepository: IUserRepository,
    private readonly roleRepository: IGuestRoleRepository,
    private readonly logger: ILogger,
    private readonly mailService: Pick<IMailService, "sendExistingAccountMail">,
    private readonly config: UserAuthUseCaseConfig,
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
      this.logger,
      data.password,
      "Sign-up",
    );
    if (refusal) {
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, refusal);
    }

    const signedUp = await this.userRepository.signUp(request);
    if (signedUp.errorCode === DomainErrorCodes.DUPLICATE_ENTITY) {
      // The answer stays neutral; the owner hears of it by mail. Not awaited,
      // so that a taken address does not answer later than a free one.
      void this.noticeExistingAccount(data.email);
    }
    return signedUp;
  }

  private async noticeExistingAccount(email: string): Promise<void> {
    const home = this.config.adminHomeUri;
    try {
      await this.mailService.sendExistingAccountMail(
        email,
        `${home}/#/login`,
        `${home}/#/forgot-password`,
      );
    } catch (error) {
      this.logger.err(error);
    }
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
