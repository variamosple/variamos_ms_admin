import { Nullable } from "@src/Domain/Core/Entity/Nullable";

export class Visit {
  pageId: string;
  userId: string;
  countryCode: Nullable<string>;

  constructor(pageId: string, userId: string, countryCode?: Nullable<string>) {
    this.pageId = pageId;
    this.userId = userId;
    this.countryCode = countryCode;
  }
}
