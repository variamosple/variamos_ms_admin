export class Metric {
  private id: string;
  private title: string;
  private chartType: string;
  private defaultFilter: string;
  private filters?: string[];
  private labelKey?: string;
  private data: any;

  constructor(
    id: string,
    title: string,
    chartType: string,
    defaultFilter: string,
    filters?: string[],
    labelKey?: string,
    data?: any
  ) {
    this.id = id;
    this.title = title;
    this.chartType = chartType;
    this.defaultFilter = defaultFilter;
    this.filters = filters;
    this.labelKey = labelKey;
    this.data = data;
  }

  public getId(): string {
    return this.id;
  }

  public getTitle(): string {
    return this.title;
  }

  public getChartType(): string {
    return this.chartType;
  }

  public getDefaultFilter(): string {
    return this.defaultFilter;
  }

  public getFilters() {
    return this.filters;
  }

  public getLabelKey() {
    return this.labelKey;
  }

  public getData(): any {
    return this.data;
  }

  public static builder(): MetricBuilder {
    return new MetricBuilder();
  }

  public static build(builder: MetricBuilder): Metric {
    return new Metric(
      builder.getId(),
      builder.getTitle(),
      builder.getChartType(),
      builder.getDefaultFilter(),
      builder.getFilters(),
      builder.getLabelKey(),
      builder.getData()
    );
  }
}

class MetricBuilder {
  private id!: string;
  private title!: string;
  private chartType!: string;
  private defaultFilter!: string;
  private filters?: string[];
  private labelKey?: string;
  private data!: any;

  public getId(): string {
    return this.id;
  }

  public setId(id: string): MetricBuilder {
    this.id = id;
    return this;
  }

  public getTitle(): string {
    return this.title;
  }

  public setTitle(title: string): MetricBuilder {
    this.title = title;
    return this;
  }

  public getChartType(): string {
    return this.chartType;
  }

  public setChartType(chartType: string): MetricBuilder {
    this.chartType = chartType;
    return this;
  }

  public getDefaultFilter(): string {
    return this.defaultFilter;
  }

  public setDefaultFilter(defaultFilter: string): MetricBuilder {
    this.defaultFilter = defaultFilter;
    return this;
  }

  public getFilters() {
    return this.filters;
  }

  public setFilters(filters?: string[]): MetricBuilder {
    this.filters = filters;
    return this;
  }

  public getLabelKey() {
    return this.labelKey;
  }

  public setLabelKey(labelKey: string): MetricBuilder {
    this.labelKey = labelKey;
    return this;
  }

  public getData(): any {
    return this.data;
  }

  public setData(data: any): MetricBuilder {
    this.data = data;
    return this;
  }

  public build(): Metric {
    return new Metric(
      this.id,
      this.title,
      this.chartType,
      this.defaultFilter,
      this.filters,
      this.labelKey,
      this.data
    );
  }
}
