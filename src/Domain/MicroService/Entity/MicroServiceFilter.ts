import { Nullable } from "@src/Domain/Core/Entity/Nullable";
import { PagedModel } from "@src/Domain/Core/Entity/PagedModel";

export class MicroServiceFilter extends PagedModel {
  constructor(public name?: string, pageNumber?: number, pageSize?: number) {
    super(pageNumber, pageSize);
  }

  public static builder(): MicroServiceFilterBuilder {
    return new MicroServiceFilterBuilder();
  }

  public static build(builder: MicroServiceFilterBuilder): MicroServiceFilter {
    return new MicroServiceFilter(
      builder.name!,
      builder.pageNumber,
      builder.pageSize
    );
  }
}

class MicroServiceFilterBuilder {
  public name: Nullable<string>;
  public pageNumber?: number;
  public pageSize?: number;

  public setName(name: string): MicroServiceFilterBuilder {
    this.name = name;
    return this;
  }

  public setPageNumber(pageNumber: number): MicroServiceFilterBuilder {
    this.pageNumber = pageNumber;
    return this;
  }

  public setPageSize(pageSize: number): MicroServiceFilterBuilder {
    this.pageSize = pageSize;
    return this;
  }

  public build(): MicroServiceFilter {
    return MicroServiceFilter.build(this);
  }
}
