import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Credentials } from "./Entity/Credentials";
import { PasswordUpdate } from "./Entity/PasswordUpdate";
import { PersonalInformationUpdate } from "./Entity/PersonalInformationUpdate";
import { User } from "./Entity/User";
import { UserFilter } from "./Entity/UserFilter";
import { UserRegistration } from "./Entity/UserRegistration";
import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { IMailService } from "@src/Domain/Mail/IMailService";
import { IGuestRoleRepository } from "@src/Domain/Role/Repository/IGuestRoleRepository";

import { UserAuthUseCase } from "./UseCase/UserAuthUseCase";
import { UserPasswordUseCase } from "./UseCase/UserPasswordUseCase";
import { UserManagementUseCase } from "./UseCase/UserManagementUseCase";
import { UserQueryUseCase } from "./UseCase/UserQueryUseCase";

export interface UserUseCasesConfig {
  passwordResetExpiryInMs: number;
  adminHomeUri: string;
}

export class UsersUseCases {
  private readonly userAuthUseCase: UserAuthUseCase;
  private readonly userPasswordUseCase: UserPasswordUseCase;
  private readonly userManagementUseCase: UserManagementUseCase;
  private readonly userQueryUseCase: UserQueryUseCase;

  public constructor(
    userRepository: IUserRepository,
    mailService: IMailService,
    roleRepository: IGuestRoleRepository,
    config: UserUseCasesConfig,
  ) {
    this.userAuthUseCase = new UserAuthUseCase(userRepository, roleRepository);
    this.userPasswordUseCase = new UserPasswordUseCase(userRepository, mailService, config);
    this.userManagementUseCase = new UserManagementUseCase(userRepository);
    this.userQueryUseCase = new UserQueryUseCase(userRepository);
  }

  public queryUsers(request: RequestModel<UserFilter>): Promise<ResponseModel<User[]>> {
    return this.userQueryUseCase.queryList(request);
  }

  public findSessionUser(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return this.userQueryUseCase.sessionUser(request);
  }

  public findOrCreateUser(request: RequestModel<User>): Promise<ResponseModel<User>> {
    return this.userAuthUseCase.findOrCreate(request);
  }

  public signIn(request: RequestModel<Credentials>): Promise<ResponseModel<User>> {
    return this.userAuthUseCase.signIn(request);
  }

  public signUp(request: RequestModel<UserRegistration>): Promise<ResponseModel<User>> {
    return this.userAuthUseCase.signUp(request);
  }

  public queryById(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return this.userQueryUseCase.queryById(request);
  }

  public disableUser(request: RequestModel<string>): Promise<ResponseModel<void>> {
    return this.userManagementUseCase.disable(request);
  }

  public enableUser(request: RequestModel<string>): Promise<ResponseModel<void>> {
    return this.userManagementUseCase.enable(request);
  }

  public deleteUser(request: RequestModel<string>): Promise<ResponseModel<void>> {
    return this.userManagementUseCase.delete(request);
  }

  public getMyAccount(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return this.userQueryUseCase.myAccount(request);
  }

  public updatePassword(request: RequestModel<PasswordUpdate>): Promise<ResponseModel<void>> {
    return this.userManagementUseCase.updatePassword(request);
  }

  public updatePersonalInformation(
    request: RequestModel<PersonalInformationUpdate>,
  ): Promise<ResponseModel<void>> {
    return this.userManagementUseCase.updateProfile(request);
  }

  public getGuestData(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return this.userAuthUseCase.getGuestData(request);
  }

  public requestPasswordReset(request: RequestModel<string>): Promise<ResponseModel<void>> {
    return this.userPasswordUseCase.requestReset(request);
  }

  public verifyPasswordResetToken(request: RequestModel<string>): Promise<ResponseModel<void>> {
    return this.userPasswordUseCase.verifyToken(request);
  }

  public resetPassword(
    request: RequestModel<{ token: string; password: string }>,
  ): Promise<ResponseModel<void>> {
    return this.userPasswordUseCase.resetPassword(request);
  }

  public generateRecoveryLink(
    request: RequestModel<{ userId: string; adminId: string }>,
  ): Promise<ResponseModel<{ recoveryUrl: string }>> {
    return this.userPasswordUseCase.generateLink(request);
  }
}
