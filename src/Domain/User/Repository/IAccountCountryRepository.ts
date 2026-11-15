/** The country of an account, for the statistics by country (EV-90). */
export interface IAccountCountryRepository {
  /**
   * Gives the account this country when it has none and the code is one of
   * the countries table. True when it was saved; a country already chosen
   * is never changed.
   */
  setIfMissing(userId: string, countryCode: string): Promise<boolean>;
}
