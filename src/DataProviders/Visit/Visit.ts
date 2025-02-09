import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { Model, TEXT, UUIDV4 } from "sequelize";

export interface VisitAttributes {
  pageId: string;
  userId: string;
  countryCode?: string;
}

export class VisitModel
  extends Model<VisitAttributes>
  implements VisitAttributes
{
  public pageId!: string;
  public userId!: string;
  public countryCode?: string;
}

VisitModel.init(
  {
    pageId: {
      type: TEXT,
      field: "page_id",
    },
    userId: {
      type: TEXT,
      defaultValue: UUIDV4,
      field: "user_id",
    },
    countryCode: {
      type: TEXT,
      field: "country_code",
    },
  },
  {
    tableName: "page_visit",
    sequelize: VARIAMOS_ORM,
    schema: "variamos",
    timestamps: false,
  }
);

VisitModel.removeAttribute("id");
