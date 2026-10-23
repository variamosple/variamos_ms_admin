import crypto from "node:crypto";
import bcrypt from "bcrypt";
import logger from "jet-logger";
import { Op, QueryTypes, type Transaction, type WhereOptions } from "sequelize";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { Credentials } from "#src/Domain/User/Entity/Credentials.js";
import type { PasswordUpdate } from "#src/Domain/User/Entity/PasswordUpdate.js";
import type { PersonalInformationUpdate } from "#src/Domain/User/Entity/PersonalInformationUpdate.js";
import { User } from "#src/Domain/User/Entity/User.js";
import { UserFilter } from "#src/Domain/User/Entity/UserFilter.js";
import type { UserRegistration } from "#src/Domain/User/Entity/UserRegistration.js";
import type {
  IUserRepository,
  PasswordResetOutcome,
} from "#src/Domain/User/IUserRepository.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import { BaseRepository } from "../BaseRepository.js";
import { CountryModel } from "../Countries/Country.js";
import type { PermissionModel } from "../Permission/Permission.js";
import type { RoleModel } from "../Role/Role.js";
import { type UserAttributes, UserModel } from "./User.js";

interface UserModelWithCountry extends UserModel {
  country?: CountryModel | null;
}

export class UserRepositoryImpl
  extends BaseRepository
  implements IUserRepository
{
  private readonly bcryptSaltRounds: number;
  private dummyHashPromise?: Promise<string>;

  public constructor(config: { bcryptSaltRounds: number }) {
    super();
    this.bcryptSaltRounds = config.bcryptSaltRounds;
  }

  public async queryUsers(
    request: RequestModel<UserFilter>,
  ): Promise<ResponseModel<User[]>> {
    const response = new ResponseModel<User[]>(request.transactionId);

    try {
      const { data: filter = new UserFilter() } = request;

      const replacements = super.initializeReplacements(filter);

      response.totalCount = await VARIAMOS_ORM.query<{ count: string }>(
        `
            SELECT COUNT(1) AS count
            FROM ${DB_SCHEMA}.user
            WHERE (:search IS NULL OR name ILIKE '%' || :search || '%' OR email ILIKE '%' || :search || '%')
              AND (:name IS NULL OR name ILIKE '%' || :name || '%');   
        `,
        { type: QueryTypes.SELECT, replacements },
      ).then((result) => Number(result[0]?.count) || 0);

      const where: WhereOptions<UserAttributes> = filter.search
        ? {
            [Op.or]: [
              { name: { [Op.iLike]: `%${String(replacements.search)}%` } },
              { email: { [Op.iLike]: `%${String(replacements.search)}%` } },
            ],
            ...(filter.name
              ? { name: { [Op.iLike]: `%${String(replacements.name)}%` } }
              : {}),
          }
        : filter.name
          ? { name: { [Op.iLike]: `%${String(replacements.name)}%` } }
          : {};

      const pageNumber = filter.pageNumber ?? 1;
      const pageSize = filter.pageSize ?? 10;

      response.data = await UserModel.findAll({
        where,
        limit: pageSize,
        offset: (pageNumber - 1) * pageSize,
        order: [["name", "ASC"]],
      }).then((res) =>
        res.map(
          ({
            id,
            user,
            name,
            email,
            isEnabled,
            isDeleted,
            createdAt,
            lastLogin,
          }) =>
            User.builder()
              .setId(id)
              .setUser(user)
              .setName(name)
              .setEmail(email)
              .setIsEnabled(isEnabled ?? true)
              .setIsDeleted(isDeleted ?? false)
              .setCreatedAt(createdAt ?? new Date())
              .setLastLogin(lastLogin)
              .build(),
        ),
      );
    } catch (error) {
      const err = error as Error;
      logger.err("Error in getUsers:");
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async findSessionUser(
    request: RequestModel<string>,
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data: userId } = request;

      if (!userId) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "UserId is required",
        );
      }

      const dbUser = await UserModel.findOne({
        where: { id: userId },
      });

      if (!dbUser) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          "User not found.",
        );
      }

      if (!dbUser.isEnabled) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Your account is disabled.",
        );
      }

      if (dbUser.isDeleted) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Your account is deleted.",
        );
      }

      response.data = User.builder()
        .setId(dbUser.id)
        .setUser(dbUser.user)
        .setName(dbUser.name)
        .setEmail(dbUser.email)
        .build();

      await this.enrichUserRolesAndPermissions(response.data);
    } catch (error) {
      const err = error as Error;
      logger.err("Error in findSessionUser:");
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
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

      const [dbUser, crated] = await UserModel.findOrCreate({
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

      if (!dbUser.isEnabled) {
        return response.withError(
          DomainErrorCodes.FORBIDDEN,
          "Your account is disabled.",
        );
      }

      if (dbUser.isDeleted) {
        return response.withError(
          DomainErrorCodes.FORBIDDEN,
          "Your account is deleted.",
        );
      }

      if (!crated) {
        await UserModel.update(
          { lastLogin: new Date() },
          {
            where: {
              id: dbUser.id,
            },
          },
        );
      }

      response.data = User.builder()
        .setId(dbUser.id)
        .setUser(dbUser.user)
        .setName(dbUser.name)
        .setEmail(dbUser.email)
        .build();

      await this.enrichUserRolesAndPermissions(response.data);
    } catch (error) {
      const err = error as Error;
      logger.err("Error in findOrCreateUser:");
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  /** A hash of a random value, compared when no account can sign in. */
  private dummyHash(): Promise<string> {
    this.dummyHashPromise ??= bcrypt.hash(
      crypto.randomUUID(),
      this.bcryptSaltRounds,
    );
    return this.dummyHashPromise;
  }

  public async signIn(
    request: RequestModel<Credentials>,
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Credentials are required.",
        );
      }

      const email = data.email;
      const password = data.password;
      if (!email || !password) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "email and password are required.",
        );
      }

      const dbUser = await UserModel.findOne({
        where: { email },
      });

      const errorMessage = "Incorrect username or password.";
      const canSignIn =
        !!dbUser?.password && dbUser.isEnabled && !dbUser.isDeleted;

      // Unknown and disabled accounts pay the same bcrypt cost as a wrong
      // password: the response time does not reveal whether an account exists.
      const passwordMatch = await bcrypt.compare(
        password,
        canSignIn ? (dbUser.password as string) : await this.dummyHash(),
      );

      if (!canSignIn || !passwordMatch) {
        return response.withError(DomainErrorCodes.INVALID_INPUT, errorMessage);
      }

      await UserModel.update(
        { lastLogin: new Date() },
        {
          where: {
            id: dbUser.id,
          },
        },
      );

      response.data = User.builder()
        .setId(dbUser.id)
        .setUser(dbUser.user)
        .setName(dbUser.name)
        .setEmail(dbUser.email)
        .build();

      await this.enrichUserRolesAndPermissions(response.data);
    } catch (error) {
      const err = error as Error;
      logger.err("Error in signIn:");
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

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

      const email = data.email;
      const password = data.password;
      const name = data.name;

      if (!email || !password || !name) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "email, password, and name are required.",
        );
      }

      const dbUser = await UserModel.findOne({
        where: { email },
      });

      if (dbUser) {
        logger.warn("User already registered");
        return response.withError(DomainErrorCodes.DUPLICATE_ENTITY, "");
      }
      const hashedPassword = await bcrypt.hash(password, 10);

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
      const err = error as Error;
      logger.err("Error in signUp:");
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async queryById(
    request: RequestModel<string>,
  ): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "User ID is required.",
        );
      }

      response.data = await UserModel.findOne({
        where: { id: data },
        include: [
          {
            model: CountryModel,
            as: "country",
          },
        ],
      }).then((res) => {
        if (!res) return undefined;
        const typedRes = res as UserModelWithCountry;
        return User.builder()
          .setId(typedRes.id)
          .setUser(typedRes.user)
          .setName(typedRes.name)
          .setEmail(typedRes.email)
          .setCountryCode(typedRes.countryCode)
          .setCountryName(typedRes.country?.name)
          .setIsEnabled(typedRes.isEnabled ?? true)
          .setIsDeleted(typedRes.isDeleted ?? false)
          .setCreatedAt(typedRes.createdAt ?? new Date())
          .setLastLogin(typedRes.lastLogin)
          .build();
      });
    } catch (error) {
      const err = error as Error;
      logger.err("Error in queryById:");
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async disableUser(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "User ID is required.",
        );
      }

      await UserModel.update(
        {
          isEnabled: false,
        },
        {
          where: { id: data },
        },
      );
    } catch (error) {
      const err = error as Error;
      logger.err("Error in disableUser:");
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async enableUser(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "User ID is required.",
        );
      }

      await UserModel.update(
        {
          isEnabled: true,
        },
        {
          where: { id: data },
        },
      );
    } catch (error) {
      const err = error as Error;
      logger.err("Error in enableUser:");
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async deleteUser(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "User ID is required.",
        );
      }

      await UserModel.update(
        {
          isDeleted: true,
        },
        {
          where: { id: data },
        },
      );
    } catch (error) {
      const err = error as Error;
      logger.err("Error in deleteUser:");
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  private async enrichUserRolesAndPermissions(user: User) {
    if (!user?.id) {
      return;
    }

    const replacements = this.initializeReplacements({ userId: user.id });

    user.roles = await VARIAMOS_ORM.query<RoleModel>(
      `
        SELECT r.name
        FROM ${DB_SCHEMA}.role r
        INNER JOIN ${DB_SCHEMA}.user_role ur ON r.id = ur.role_id
        WHERE ur.user_id = :userId
      `,
      {
        type: QueryTypes.SELECT,
        replacements,
      },
    ).then((res) => res.map(({ name }) => name));

    user.permissions = await VARIAMOS_ORM.query<PermissionModel>(
      `
        SELECT p.name
        FROM ${DB_SCHEMA}.user_role ur
        INNER JOIN ${DB_SCHEMA}.role_permission rp ON ur.role_id = rp.role_id
        INNER JOIN ${DB_SCHEMA}.permission p ON p.id = rp.permission_id
        WHERE ur.user_id = :userId
      `,
      {
        type: QueryTypes.SELECT,
        replacements,
      },
    ).then((res) => res.map(({ name }) => name));
  }

  public async updateUserPassword(
    request: RequestModel<PasswordUpdate>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const passwordUpdate = request.data;
      if (!passwordUpdate) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Password update data is required.",
        );
      }

      const dbUser = await UserModel.findOne({
        where: { id: passwordUpdate.getId() },
      });

      if (!dbUser) {
        return response.withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          "User not found.",
        );
      }

      const passwordMatch = await bcrypt.compare(
        passwordUpdate.getCurrentPassword(),
        dbUser.password ?? "",
      );

      if (!passwordMatch) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Current password is incorrect.",
        );
      }

      const newHashedPassword = await bcrypt.hash(
        passwordUpdate.getNewPassword(),
        10,
      );

      await VARIAMOS_ORM.transaction(async (transaction) => {
        await UserModel.update(
          { password: newHashedPassword },
          { where: { id: dbUser.id }, transaction },
        );
        await this.forgetTrustedDevices(String(dbUser.id), transaction);
      });
    } catch (error) {
      const err = error as Error;
      logger.err("Error in updateUserPassword:");
      logger.err(
        `Error trying to update user password with id: ${request.data ? request.data.getId() : ""}`,
      );
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  /** A new password asks the sign-in code again on every browser (lot 6). */
  private async forgetTrustedDevices(
    userId: string,
    transaction: Transaction,
  ): Promise<void> {
    await VARIAMOS_ORM.query(
      `DELETE FROM "${DB_SCHEMA}"."user_mfa_trusted_device" WHERE "user_id" = :userId`,
      { replacements: { userId }, transaction },
    );
  }

  /** Same cost whatever the account, as at sign-in. */
  public async verifyPassword(
    userId: string,
    password: string,
  ): Promise<boolean> {
    const dbUser = await UserModel.findOne({ where: { id: userId } });
    const canSignIn =
      !!dbUser?.password && dbUser.isEnabled && !dbUser.isDeleted;
    const passwordMatch = await bcrypt.compare(
      password,
      canSignIn ? (dbUser.password as string) : await this.dummyHash(),
    );
    return canSignIn === true && passwordMatch;
  }

  public async getUserByEmail(email: string): Promise<User | null> {
    try {
      const dbUser = await UserModel.findOne({
        where: { email },
      });

      if (!dbUser) {
        return null;
      }
      return User.builder()
        .setId(dbUser.id)
        .setUser(dbUser.user)
        .setName(dbUser.name)
        .setEmail(dbUser.email)
        .setIsEnabled(dbUser.isEnabled ?? true)
        .setIsDeleted(dbUser.isDeleted ?? false)
        .setCreatedAt(dbUser.createdAt || new Date())
        .build();
    } catch (error) {
      logger.err(`Error in getUserByEmail: ${error}`);
      return null;
    }
  }

  public async savePasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    try {
      await VARIAMOS_ORM.query(
        `
        INSERT INTO "${DB_SCHEMA}"."password_reset_tokens"
        ("user_id", "token_hash", "expires_at")
        VALUES
        (:userId, :tokenHash, :expiresAt)
        `,
        {
          replacements: {
            userId,
            tokenHash,
            expiresAt,
          },
        },
      );
    } catch (error) {
      logger.err(`Error in savePasswordResetToken: ${error}`);
      throw error;
    }
  }

  public async getPasswordResetToken(tokenHash: string): Promise<{
    userId: string;
    expiresAt: Date;
    usedAt?: Date | null;
    isUserActive: boolean;
  } | null> {
    try {
      interface PasswordResetTokenRow {
        userId: string;
        expiresAt: Date;
        usedAt?: Date | null;
        isUserActive: boolean;
      }

      const results = await VARIAMOS_ORM.query<PasswordResetTokenRow>(
        `
        SELECT t."user_id" AS "userId", t."expires_at" AS "expiresAt",
          t."used_at" AS "usedAt",
          COALESCE(u."is_enabled" AND NOT u."is_deleted", false) AS "isUserActive"
        FROM "${DB_SCHEMA}"."password_reset_tokens" t
        LEFT JOIN "${DB_SCHEMA}"."user" u ON u."id"::text = t."user_id"
        WHERE t."token_hash" = :tokenHash
        LIMIT 1
        `,
        {
          replacements: { tokenHash },
          type: QueryTypes.SELECT,
        },
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      logger.err(`Error in getPasswordResetToken: ${error}`);
      return null;
    }
  }

  public async resetPasswordWithToken(
    tokenHash: string,
    passwordPlain: string,
  ): Promise<PasswordResetOutcome> {
    const transaction = await VARIAMOS_ORM.transaction();
    try {
      // Check and consume in one statement: a concurrent request waits on the
      // row lock, then finds used_at set and updates nothing.
      const consumed = await VARIAMOS_ORM.query<{ userId: string }>(
        `
        UPDATE "${DB_SCHEMA}"."password_reset_tokens"
        SET "used_at" = NOW()
        WHERE "token_hash" = :tokenHash
          AND "used_at" IS NULL
          AND "expires_at" > :now
        RETURNING "user_id" AS "userId"
        `,
        {
          replacements: { tokenHash, now: new Date() },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
      const userId = consumed[0]?.userId;
      if (!userId) {
        await transaction.rollback();
        return "invalid_token";
      }

      const dbUser = await UserModel.findOne({
        where: { id: userId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!dbUser?.isEnabled || dbUser.isDeleted) {
        await transaction.rollback();
        return "inactive_account";
      }

      if (await bcrypt.compare(passwordPlain, dbUser.password || "")) {
        // Rolled back: the link stays usable for another password
        await transaction.rollback();
        return "same_password";
      }

      const passwordHash = await bcrypt.hash(
        passwordPlain,
        this.bcryptSaltRounds,
      );
      await UserModel.update(
        { password: passwordHash },
        { where: { id: userId }, transaction },
      );
      await this.forgetTrustedDevices(userId, transaction);

      await transaction.commit();
      return "reset";
    } catch (error) {
      await transaction.rollback();
      logger.err(`Error in resetPasswordWithToken: ${error}`);
      throw error;
    }
  }

  public async updatePersonalInformation(
    request: RequestModel<PersonalInformationUpdate>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const personalInformation = request.data;
      if (!personalInformation) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Personal information data is required.",
        );
      }

      await UserModel.update(
        { countryCode: personalInformation.getCountryCode() ?? null },
        {
          where: {
            id: personalInformation.getUserId(),
          },
        },
      );
    } catch (error) {
      const err = error as Error;
      logger.err("Error in updatePersonalInformation:");
      logger.err(
        `Error trying to update user information with id: ${request.data ? request.data.getUserId() : ""}`,
      );
      logger.err(err);
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
      const err = error as Error;
      logger.err("Error in userExists:");
      logger.err(err);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }
}
