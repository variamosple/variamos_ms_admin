import type { Nullable } from "@src/Domain/Core/Entity/Nullable.js";

export class Visit {
  public pageId: string;
  public userId: string;
  public countryCode: Nullable<string>;

  public constructor(
    pageId: string,
    userId: string,
    countryCode?: Nullable<string>,
  ) {
    this.pageId = pageId;
    this.userId = userId;
    this.countryCode = countryCode || null;
  }
}
