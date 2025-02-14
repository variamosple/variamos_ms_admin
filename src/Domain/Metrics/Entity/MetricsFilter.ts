export class MetricsFilter {
  private id: string;
  private startDate: string;
  private endDate: string;

  constructor(id: string, startDate: string, endDate: string) {
    this.id = id;
    this.startDate = startDate;
    this.endDate = endDate;
  }

  public getId(): string {
    return this.id;
  }

  public getStartDate(): string {
    return this.startDate;
  }

  public getEndDate(): string {
    return this.endDate;
  }

  public static builder(): MetricsFilterBuilder {
    return new MetricsFilterBuilder();
  }

  public static build(builder: MetricsFilterBuilder): MetricsFilter {
    return new MetricsFilter(
      builder.getId(),
      builder.getStartDate(),
      builder.getEndDate()
    );
  }
}

class MetricsFilterBuilder {
  private id!: string;
  private startDate!: string;
  private endDate!: string;

  public getId(): string {
    return this.id;
  }

  public setId(id: string): MetricsFilterBuilder {
    this.id = id;
    return this;
  }

  public getStartDate(): string {
    return this.startDate;
  }

  public setStartDate(startDate: string): MetricsFilterBuilder {
    this.startDate = startDate;
    return this;
  }

  public getEndDate(): string {
    return this.endDate;
  }

  public setEndDate(endDate: string): MetricsFilterBuilder {
    this.endDate = endDate;
    return this;
  }

  public build(): MetricsFilter {
    return new MetricsFilter(this.id, this.startDate, this.endDate);
  }
}
