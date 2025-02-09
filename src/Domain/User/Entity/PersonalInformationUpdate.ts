import { Nullable } from "@src/Domain/Core/Entity/Nullable";

export class PersonalInformationUpdate {
  private userId: string;
  private countryCode: Nullable<string>;

  constructor(userId: string, countryCode: Nullable<string>) {
    this.userId = userId;
    this.countryCode = countryCode;
  }

  public getUserId(): string {
    return this.userId;
  }

  public getCountryCode(): Nullable<string> {
    return this.countryCode;
  }

  public static builder(): PersonalInformationUpdateBuilder {
    return new PersonalInformationUpdateBuilder();
  }

  public static build(
    builder: PersonalInformationUpdateBuilder
  ): PersonalInformationUpdate {
    return new PersonalInformationUpdate(
      builder.getUserId(),
      builder.getCountryCode()
    );
  }
}

class PersonalInformationUpdateBuilder {
  private userId!: string;
  private countryCode!: Nullable<string>;

  public getUserId(): string {
    return this.userId;
  }

  public setUserId(userId: string): PersonalInformationUpdateBuilder {
    this.userId = userId;
    return this;
  }

  public getCountryCode(): Nullable<string> {
    return this.countryCode;
  }

  public setCountryCode(
    countryCode: Nullable<string>
  ): PersonalInformationUpdateBuilder {
    this.countryCode = countryCode;
    return this;
  }

  public build(): PersonalInformationUpdate {
    return new PersonalInformationUpdate(this.userId, this.countryCode);
  }
}
