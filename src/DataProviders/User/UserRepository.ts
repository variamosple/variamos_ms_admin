import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { User } from "@src/Domain/User/Entity/User";
import { UserFilter } from "@src/Domain/User/Entity/UserFilter";
import { Credentials } from "@src/Domain/User/Entity/Credentials";
import { UserRegistration } from "@src/Domain/User/Entity/UserRegistration";
import { PasswordUpdate } from "@src/Domain/User/Entity/PasswordUpdate";
import { PersonalInformationUpdate } from "@src/Domain/User/Entity/PersonalInformationUpdate";
import { IUserRepository } from "@src/Domain/User/IUserRepository";

import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import logger from "jet-logger";
import { Op, QueryTypes, WhereOptions } from "sequelize";
import bcrypt from "bcrypt";
import EnvVars from "@src/common/EnvVars";
import { BaseRepository } from "../BaseRepository";
import { RoleModel } from "../Role/Role";
import { PermissionModel } from "../Permission/Permission";
import { CountryModel } from "../Countries/Country";
import { UserAttributes, UserModel } from "./User";

interface UserModelWithCountry extends UserModel {
  country?: CountryModel | null;
}

export class UserRepositoryImpl extends BaseRepository implements IUserRepository {
  public async queryUsers(request: RequestModel<UserFilter>): Promise<ResponseModel<User[]>> {
    const response = new ResponseModel<User[]>(request.transactionId);

    try {
      const { data: filter = new UserFilter() } = request;

      const replacements = super.initializeReplacements(filter);

      response.totalCount = await VARIAMOS_ORM.query<{ count: string }>(
        `
            SELECT COUNT(1) AS count
            FROM variamos.user
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
            ...(filter.name ? { name: { [Op.iLike]: `%${String(replacements.name)}%` } } : {}),
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
        res.map(({ id, user, name, email }) =>
          User.builder().setId(id).setUser(user).setName(name).setEmail(email).build(),
        ),
      );
    } catch (error) {
      const err = error as Error;
      logger.err("Error in getUsers:");
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async findSessionUser(request: RequestModel<string>): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data: userId } = request;

      if (!userId) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "UserId is required");
      }

      const dbUser = await UserModel.findOne({
        where: { id: userId },
      });

      if (!dbUser) {
        return response.withError(DomainErrorCodes.NOT_FOUND, "User not found.");
      }

      if (!dbUser.isEnabled) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "Your account is disabled.");
      }

      if (dbUser.isDeleted) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "Your account is deleted.");
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
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async findOrCreateUser(request: RequestModel<User>): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;

      if (!data) {
        return response.withError(DomainErrorCodes.NOT_FOUND, "User information is required");
      }

      const email = data.email;
      const user = data.user;
      const name = data.name;

      if (!email || !user || !name) {
        return response.withError(
          DomainErrorCodes.BAD_REQUEST,
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
        return response.withError(DomainErrorCodes.BAD_REQUEST, "Your account is disabled.");
      }

      if (dbUser.isDeleted) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "Your account is deleted.");
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
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async signIn(request: RequestModel<Credentials>): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "Credentials are required.");
      }

      const email = data.email;
      const password = data.password;
      if (!email || !password) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "email and password are required.");
      }

      const dbUser = await UserModel.findOne({
        where: { email },
      });

      const errorMessage = "Incorrect username or password.";

      if (!dbUser || !dbUser.password || !dbUser.isEnabled || dbUser.isDeleted) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, errorMessage);
      }

      const passwordMatch = await bcrypt.compare(password, dbUser.password);

      if (!passwordMatch) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, errorMessage);
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
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async signUp(request: RequestModel<UserRegistration>): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(
          DomainErrorCodes.BAD_REQUEST,
          "UserRegistration data is required.",
        );
      }

      const email = data.email;
      const password = data.password;
      const name = data.name;

      if (!email || !password || !name) {
        return response.withError(
          DomainErrorCodes.BAD_REQUEST,
          "email, password, and name are required.",
        );
      }

      const dbUser = await UserModel.findOne({
        where: { email },
      });

      if (dbUser) {
        logger.warn("User already registered");
        return response.withError(DomainErrorCodes.CONFLICT, "");
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
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async queryById(request: RequestModel<string>): Promise<ResponseModel<User>> {
    const response = new ResponseModel<User>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "User ID is required.");
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
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async disableUser(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "User ID is required.");
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
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async enableUser(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "User ID is required.");
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
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async deleteUser(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);

    try {
      const { data } = request;
      if (!data) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "User ID is required.");
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
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  private async enrichUserRolesAndPermissions(user: User) {
    if (!user || !user.id) {
      return;
    }

    const replacements = this.initializeReplacements({ userId: user.id });

    user.roles = await VARIAMOS_ORM.query<RoleModel>(
      `
        SELECT r.name
        FROM variamos.role r
        INNER JOIN variamos.user_role ur ON r.id = ur.role_id
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
        FROM variamos.user_role ur
        INNER JOIN variamos.role_permission rp ON ur.role_id = rp.role_id
        INNER JOIN variamos.permission p ON p.id = rp.permission_id
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
          DomainErrorCodes.BAD_REQUEST,
          "Password update data is required.",
        );
      }

      const dbUser = await UserModel.findOne({
        where: { id: passwordUpdate.getId() },
      });

      if (!dbUser) {
        return response.withError(DomainErrorCodes.NOT_FOUND, "User not found.");
      }

      const passwordMatch = await bcrypt.compare(
        passwordUpdate.getCurrentPassword(),
        dbUser.password ?? "",
      );

      if (!passwordMatch) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "Current password is incorrect.");
      }

      const newHashedPassword = await bcrypt.hash(passwordUpdate.getNewPassword(), 10);

      await UserModel.update(
        { password: newHashedPassword },
        {
          where: {
            id: dbUser.id,
          },
        },
      );
    } catch (error) {
      const err = error as Error;
      logger.err("Error in updateUserPassword:");
      logger.err(
        "Error trying to update user password with id: " +
          (request.data ? request.data.getId() : ""),
      );
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
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
      logger.err("Error in getUserByEmail: " + error);
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
        INSERT INTO "variamos"."password_reset_tokens"
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
      logger.err("Error in savePasswordResetToken: " + error);
      throw error;
    }
  }

  public async getPasswordResetToken(tokenHash: string): Promise<{
    userId: string;
    expiresAt: Date;
    usedAt?: Date | null;
  } | null> {
    try {
      interface PasswordResetTokenRow {
        userId: string;
        expiresAt: Date;
        usedAt?: Date | null;
      }

      const results = await VARIAMOS_ORM.query<PasswordResetTokenRow>(
        `
        SELECT "user_id" AS "userId", "expires_at" AS "expiresAt", "used_at" AS "usedAt"
        FROM "variamos"."password_reset_tokens"
        WHERE "token_hash" = :tokenHash
        LIMIT 1
        `,
        {
          replacements: { tokenHash },
          type: QueryTypes.SELECT,
        },
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      logger.err("Error in getPasswordResetToken: " + error);
      return null;
    }
  }

  public async resetPasswordAndUpdateToken(
    userId: string,
    passwordPlain: string,
    tokenHash: string,
  ): Promise<void> {
    const transaction = await VARIAMOS_ORM.transaction();
    try {
      const dbUser = await UserModel.findOne({
        where: { id: userId },
        transaction,
      });

      if (!dbUser) {
        throw new Error("User not found.");
      }

      const isSamePassword = await bcrypt.compare(passwordPlain, dbUser.password || "");
      if (isSamePassword) {
        throw new Error("New password cannot be the same as the old password.");
      }

      const passwordHash = await bcrypt.hash(passwordPlain, EnvVars.Auth.APP.BCRYPT_SALT_ROUNDS);
      await UserModel.update({ password: passwordHash }, { where: { id: userId }, transaction });

      await VARIAMOS_ORM.query(
        `
        UPDATE "variamos"."password_reset_tokens"
        SET "used_at" = NOW()
        WHERE "token_hash" = :tokenHash
        `,
        {
          replacements: { tokenHash },
          transaction,
        },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      logger.err("Error in resetPasswordAndUpdateToken: " + error);
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
          DomainErrorCodes.BAD_REQUEST,
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
        "Error trying to update user information with id: " +
          (request.data ? request.data.getUserId() : ""),
      );
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async userExists(request: RequestModel<string>): Promise<ResponseModel<boolean>> {
    const response = new ResponseModel<boolean>(request.transactionId);

    try {
      const { data: userId } = request;
      if (!userId) {
        return response.withError(DomainErrorCodes.BAD_REQUEST, "User ID is required.");
      }

      response.data = await UserModel.count({
        where: { id: userId },
      }).then((count) => count > 0);
    } catch (error) {
      const err = error as Error;
      logger.err("Error in userExists:");
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }
}

export const UserRepositoryInstance = new UserRepositoryImpl();
