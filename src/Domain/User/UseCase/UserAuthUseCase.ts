import crypto from "node:crypto";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import type { IGuestRoleRepository } from "#src/Domain/Role/Repository/IGuestRoleRepository.js";
import { refuseClosedAccount } from "#src/Domain/User/Entity/AccountAccess.js";
import type { Credentials } from "#src/Domain/User/Entity/Credentials.js";
import {
  decideGoogleSignIn,
  type GoogleProfile,
} from "#src/Domain/User/Entity/GoogleIdentity.js";
import { User } from "#src/Domain/User/Entity/User.js";
import { UserRegistration } from "#src/Domain/User/Entity/UserRegistration.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";
import type { AccountPasswordService } from "#src/Domain/User/Service/AccountPasswordService.js";
import {
  checkNewPassword,
  DEFAULT_PASSWORD_POLICY_PROVIDER,
  type IPasswordPolicyProvider,
} from "#src/Domain/User/Service/PasswordPolicyService.js";

/** A sign-up as the form sends it, checked once, here (EV-98). */
export interface SignUpData {
  name: string;
  email: string;
  password: string;
  passwordConfirmation: string;
}

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
    private readonly accountPasswords: Pick<
      AccountPasswordService,
      "accountOpenedBy" | "rehashIfOutdated"
    >,
    private readonly passwordPolicy: IPasswordPolicyProvider = DEFAULT_PASSWORD_POLICY_PROVIDER,
  ) {}

  /**
   * Registers an account. A taken address gets the same answer as a free
   * one, so that the form does not reveal who has an account; its owner
   * hears of it by mail.
   */
  public async signUp(
    request: RequestModel<SignUpData>,
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);
    const data = request.data;

    if (!data) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Full name, Email and password, and password confirmation are required.",
      );
    }
    let registration: UserRegistration;
    try {
      // The address, the password, the name, then the confirmation: the
      // order, and so the message, the form has always received
      registration = new UserRegistration(
        data.name,
        data.email,
        data.password,
        data.passwordConfirmation,
      );
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      return response.withErrorPromise(error.code, error.message);
    }

    const refusal = await checkNewPassword(
      this.passwordPolicy,
      this.logger,
      registration.password,
      "Sign-up",
    );
    if (refusal) {
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, refusal);
    }

    const signedUp = await this.userRepository.signUp(
      new RequestModel(request.transactionId, registration),
    );
    if (signedUp.errorCode === DomainErrorCodes.DUPLICATE_ENTITY) {
      // Not awaited, so that a taken address does not answer later than a
      // free one
      void this.noticeExistingAccount(registration.email);
      return response;
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

  /**
   * Opens an account with its password. A wrong password, an unknown
   * address and a closed account get the same answer.
   */
  public async signIn(
    request: RequestModel<Credentials>,
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);
    const data = request.data;
    if (!data) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Credentials are required.",
      );
    }
    if (!data.email || !data.password) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "email and password are required.",
      );
    }

    try {
      const account = await this.accountPasswords.accountOpenedBy(
        { email: data.email },
        data.password,
      );
      if (!account) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Incorrect username or password.",
        );
      }
      const rehashed = await this.accountPasswords.rehashIfOutdated(
        account,
        data.password,
      );
      response.data = await this.userRepository.recordSignIn(
        account.user,
        rehashed,
      );
    } catch (error) {
      this.logger.err("Error in signIn:");
      this.logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }
    return response;
  }

  /**
   * Opens the account of a Google sign-in (EV-70 lot 5): found by its link
   * to the Google account, else by its address, else created; see
   * decideGoogleSignIn for when an address may be linked.
   */
  public async signInWithGoogle(
    request: RequestModel<GoogleProfile>,
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);
    const profile = request.data;
    if (!profile?.sub || !profile.email) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "The Google account has no identifier or no address.",
      );
    }
    try {
      const linked = await this.userRepository.findGoogleAccount(profile.sub);
      const byEmail = linked
        ? null
        : await this.userRepository.findPasswordAccount({
            email: profile.email,
          });
      const decision = decideGoogleSignIn(
        profile,
        linked
          ? { kind: "linked" }
          : byEmail
            ? { kind: "by-email", hasPassword: Boolean(byEmail.passwordHash) }
            : { kind: "none" },
      );
      if (decision.action === "refuse") {
        return response.withError(
          DomainErrorCodes.UNAUTHORIZED_ACCESS,
          decision.reason,
        );
      }

      let account = linked ?? byEmail?.user ?? null;
      if (decision.action === "create") {
        const created = await this.userRepository.findOrCreateUser(
          new RequestModel(
            request.transactionId,
            User.builder()
              .setUser(profile.name)
              .setName(profile.name)
              .setEmail(profile.email)
              .build(),
          ),
        );
        if (created.errorCode || !created.data) return created;
        account = created.data;
      }
      if (!account?.id) {
        return response.withError(
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal server error",
        );
      }

      const open = refuseClosedAccount(
        response.withResponse(account),
        DomainErrorCodes.FORBIDDEN,
      );
      if (open.errorCode) return open;
      if (decision.action !== "sign-in") {
        await this.userRepository.linkGoogleIdentity(account.id, profile.sub);
      }
      open.data = await this.userRepository.recordSignIn(account);
      return open;
    } catch (error) {
      this.logger.err("Error in signInWithGoogle:");
      this.logger.err(error);
      return new ResponseModel<User>(request.transactionId).withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }
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
