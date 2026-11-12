import { QueryTypes } from "sequelize";
import logger from "#src/common/logger.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { User } from "#src/Domain/User/Entity/User.js";
import type { UserRegistration } from "#src/Domain/User/Entity/UserRegistration.js";
import type {
  IUserSignInRepository,
  PasswordAccount,
} from "#src/Domain/User/IUserSignInRepository.js";
import type { IPasswordHasher } from "#src/Domain/User/Service/IPasswordHasher.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import { UserModel } from "./User.js";
import { accountOf, enrichUserRolesAndPermissions } from "./userRows.js";

/** Sign-up and sign-in, with a password or with Google. */
export class UserSignInRepositoryImpl implements IUserSignInRepository {
  public constructor(private readonly passwordHasher: IPasswordHasher) {}

  public async signUp(
    request: RequestModel<UserRegistration>,
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "UserRegistration data is required.",
        );
      }

      // A UserRegistration is checked when built, in the use case (EV-98)
      const { email, password, name } = data;

      // Hashed before the check, so that a taken address does not answer
      // faster than a free one (the sign-up answer is the same for both)
      const hashedPassword = await this.passwordHasher.hash(password);
      const dbUser = await UserModel.findOne({
        where: { email },
      });

      if (dbUser) {
        logger.warn("User already registered");
        return response.withError(DomainErrorCodes.DUPLICATE_ENTITY, "");
      }

      const newUser = await UserModel.create({
        user: name,
        name,
        email,
        password: hashedPassword,
        isEnabled: true,
        isDeleted: false,
        createdAt: new Date(),
        lastLogin: new Date(),
      });

      response.data = User.builder()
        .setId(newUser.id)
        .setUser(newUser.user)
        .setName(newUser.name)
        .setEmail(newUser.email)
        .build();
    } catch (error) {
      logger.err("Error in signUp:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async userExists(
    request: RequestModel<string>,
  ): Promise<ResponseModel<boolean>> {
    const response = new ResponseModel<boolean>(request.transactionId);

    try {
      const { data: userId } = request;
      if (!userId) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "User ID is required.",
        );
      }

      response.data = await UserModel.count({
        where: { id: userId },
      }).then((count) => count > 0);
    } catch (error) {
      logger.err("Error in userExists:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async findPasswordAccount(
    by: { email: string } | { id: string },
  ): Promise<PasswordAccount | null> {
    const dbUser = await UserModel.findOne({
      where: "email" in by ? { email: by.email } : { id: by.id },
    });
    return dbUser
      ? { user: accountOf(dbUser), passwordHash: dbUser.password || null }
      : null;
  }

  public async recordSignIn(
    user: User,
    rehashedPassword?: string,
  ): Promise<User> {
    // A user who signs in was read from the table, with an id
    if (user.id) {
      await UserModel.update(
        {
          lastLogin: new Date(),
          ...(rehashedPassword && { password: rehashedPassword }),
        },
        { where: { id: user.id } },
      );
    }
    await enrichUserRolesAndPermissions(user);
    return user;
  }

  public async findOrCreateUser(
    request: RequestModel<User>,
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;

      if (!data) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          "User information is required",
        );
      }

      const email = data.email;
      const user = data.user;
      const name = data.name;

      if (!email || !user || !name) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "email, user, and name are required.",
        );
      }

      const [dbUser] = await UserModel.findOrCreate({
        where: { email },
        defaults: {
          user,
          email,
          name,
          isEnabled: true,
          isDeleted: false,
          createdAt: new Date(),
          lastLogin: new Date(),
        },
      });

      // The use case refuses a closed account, then records the sign-in
      response.data = accountOf(dbUser);
    } catch (error) {
      logger.err("Error in findOrCreateUser:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async findGoogleAccount(googleSub: string): Promise<User | null> {
    const [link] = await VARIAMOS_ORM.query<{ userId: string }>(
      `SELECT "user_id" AS "userId" FROM "${DB_SCHEMA}"."user_google_identity"
        WHERE "google_sub" = :googleSub`,
      { replacements: { googleSub }, type: QueryTypes.SELECT },
    );
    if (!link) return null;
    const dbUser = await UserModel.findOne({ where: { id: link.userId } });
    return dbUser ? accountOf(dbUser) : null;
  }

  public async linkGoogleIdentity(
    userId: string,
    googleSub: string,
  ): Promise<void> {
    // Two first sign-ins at once both try: the first link stays
    await VARIAMOS_ORM.query(
      `INSERT INTO "${DB_SCHEMA}"."user_google_identity" ("google_sub", "user_id")
       VALUES (:googleSub, :userId)
       ON CONFLICT DO NOTHING`,
      { replacements: { googleSub, userId } },
    );
  }
}
