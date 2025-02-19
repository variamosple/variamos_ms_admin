import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RoleRepositoryInstance } from "@src/DataProviders/Role/RoleRepository";
import { UserRepositoryInstance } from "@src/DataProviders/User/UserRepository";
import { v4 as uuidv4 } from "uuid";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { PASSWORD_REGEXP } from "../Validations/ValidationConstants";
import { PASSWORD_FORMAT_ERROR } from "../Validations/ValidationMessages";
import { Credentials } from "./Entity/Credentials";
import { PasswordUpdate } from "./Entity/PasswordUpdate";
import { PersonalInformationUpdate } from "./Entity/PersonalInformationUpdate";
import { User } from "./Entity/User";
import { UserFilter } from "./Entity/UserFilter";
import { UserRegistration } from "./Entity/UserRegistration";

export class UsersUseCases {
  queryUsers(
    request: RequestModel<UserFilter>
  ): Promise<ResponseModel<User[]>> {
    return UserRepositoryInstance.queryUsers(request);
  }

  findSessionUser(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return UserRepositoryInstance.findSessionUser(request);
  }

  findOrCreateUser(request: RequestModel<User>): Promise<ResponseModel<User>> {
    return UserRepositoryInstance.findOrCreateUser(request);
  }

  signIn(request: RequestModel<Credentials>): Promise<ResponseModel<User>> {
    return UserRepositoryInstance.signIn(request);
  }

  signUp(
    request: RequestModel<UserRegistration>
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);
    const { name, email, password, passwordConfirmation } = request.data!;

    if (!name || !email || !password || !passwordConfirmation) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "Full name, Email and password, and password confirmation are required."
      );
    }

    if (password !== passwordConfirmation) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "Password and password confirmation do not match."
      );
    }

    if (!PASSWORD_REGEXP.test(password)) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "Password must be between 8 and 24 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character."
      );
    }

    if (!PASSWORD_REGEXP.test(password)) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        PASSWORD_FORMAT_ERROR
      );
    }

    return UserRepositoryInstance.signUp(request);
  }

  queryById(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return UserRepositoryInstance.queryById(request);
  }

  disableUser(request: RequestModel<string>): Promise<ResponseModel<unknown>> {
    return UserRepositoryInstance.disableUser(request);
  }

  enableUser(request: RequestModel<string>): Promise<ResponseModel<unknown>> {
    return UserRepositoryInstance.enableUser(request);
  }

  deleteUser(request: RequestModel<string>): Promise<ResponseModel<unknown>> {
    return UserRepositoryInstance.deleteUser(request);
  }

  getMyAccount(request: RequestModel<string>): Promise<ResponseModel<User>> {
    return UserRepositoryInstance.queryById(request).then((response) => {
      if (response.data) {
        response.data = User.builder()
          .setId(response.data.id)
          .setName(response.data.name)
          .setEmail(response.data.email)
          .setUser(response.data.user)
          .setCountryCode(response.data.countryCode)
          .setCountryName(response.data.countryName)
          .build();
      }

      return response;
    });
  }

  updatePassword(
    request: RequestModel<PasswordUpdate>
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    const data = request.data!;
    const currentPassword = data.getCurrentPassword();
    const newPassword = data.getNewPassword();
    const passwordConfirmation = data.getPasswordConfirmation();

    if (!currentPassword || !newPassword || !passwordConfirmation) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "Current password, new password and password confirmation are required."
      );
    }

    if (newPassword !== passwordConfirmation) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        "New password and password confirmation do not match."
      );
    }

    if (!PASSWORD_REGEXP.test(newPassword)) {
      return response.withErrorPromise(
        HttpStatusCodes.BAD_REQUEST,
        PASSWORD_FORMAT_ERROR
      );
    }

    return UserRepositoryInstance.updateUserPassword(request);
  }

  updatePersonalInformation(
    request: RequestModel<PersonalInformationUpdate>
  ): Promise<ResponseModel<void>> {
    return UserRepositoryInstance.updatePersonalInformation(request);
  }

  async getGuestData(
    request: RequestModel<string>
  ): Promise<ResponseModel<User>> {
    let guestId = request.data || uuidv4();
    let userExists = false;
    const response = new ResponseModel<User>(request.transactionId);

    do {
      const existsReponse = await UserRepositoryInstance.userExists(
        new RequestModel<string>(request.transactionId, guestId)
      );

      if (existsReponse.errorCode) {
        return response.copyErrorWithPromise(existsReponse);
      }

      if (existsReponse.data) {
        guestId = uuidv4();
      }

      userExists = existsReponse.data!;
    } while (userExists);

    const role = await RoleRepositoryInstance.queryGuestRole(request);
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
