import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { IGuestRoleRepository } from "@src/Domain/Role/Repository/IGuestRoleRepository";
import { UserRegistration } from "@src/Domain/User/Entity/UserRegistration";
import { Credentials } from "@src/Domain/User/Entity/Credentials";
import { User } from "@src/Domain/User/Entity/User";
import { v4 as uuidv4 } from "uuid";

export class UserAuthUseCase {
  public constructor(
    private readonly userRepository: IUserRepository,
    private readonly roleRepository: IGuestRoleRepository,
  ) {}

  public async signUp(request: RequestModel<UserRegistration>): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);
    const data = request.data;

    try {
      if (!data) {
        throw new Error("Full name, Email and password, and password confirmation are required.");
      }
      UserRegistration.builder()
        .setName(data.name)
        .setEmail(data.email)
        .setPassword(data.password)
        .setPasswordConfirmation(data.passwordConfirmation)
        .build();
    } catch (error) {
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, (error as Error).message);
    }

    return this.userRepository.signUp(request);
  }

  public async signIn(request: RequestModel<Credentials>): Promise<ResponseModel<User>> {
    return this.userRepository.signIn(request);
  }

  public async findOrCreate(request: RequestModel<User>): Promise<ResponseModel<User>> {
    return this.userRepository.findOrCreateUser(request);
  }

  public async getGuestData(request: RequestModel<string>): Promise<ResponseModel<User>> {
    let guestId = request.data || uuidv4();
    let userExists = false;
    const response = new ResponseModel<User>(request.transactionId);

    do {
      const existsResponse = await this.userRepository.userExists(
        new RequestModel<string>(request.transactionId, guestId),
      );

      if (existsResponse.errorCode) {
        return response.copyErrorWithPromise(existsResponse);
      }

      if (existsResponse.data) {
        guestId = uuidv4();
      }

      userExists = existsResponse.data || false;
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
