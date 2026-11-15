import { QueryTypes, type Sequelize } from "sequelize";
import type { IAccountCountryRepository } from "#src/Domain/User/Repository/IAccountCountryRepository.js";

export class AccountCountryRepositoryImpl implements IAccountCountryRepository {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly schema: string,
  ) {}

  // One statement: a country chosen meanwhile is kept, an unknown code is
  // not saved, and the shared user table gets no other change
  public async setIfMissing(
    userId: string,
    countryCode: string,
  ): Promise<boolean> {
    const rows = await this.sequelize.query<{ id: string }>(
      `UPDATE "${this.schema}"."user" SET "country_code" = :countryCode
       WHERE "id" = :userId AND "country_code" IS NULL
         AND EXISTS (SELECT 1 FROM "${this.schema}"."country" WHERE "code" = :countryCode)
       RETURNING "id"`,
      { replacements: { userId, countryCode }, type: QueryTypes.SELECT },
    );
    return rows.length > 0;
  }
}
