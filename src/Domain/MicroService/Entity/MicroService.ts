export interface Labels {
  [label: string]: string;
}

export class MicroService {
  private id: string;
  private names: string[];
  private created: Date;
  private labels: Labels;
  private state: string;
  private status: string;

  constructor(
    id: string,
    names: string[],
    created: Date,
    labels: Labels,
    state: string,
    status: string
  ) {
    this.id = id;
    this.names = names;
    this.created = created;
    this.labels = labels;
    this.state = state;
    this.status = status;
  }

  getId(): string {
    return this.id;
  }

  getNames(): string[] {
    return this.names;
  }

  getCreated(): Date {
    return this.created;
  }

  getLabels(): Labels {
    return this.labels;
  }

  getState(): string {
    return this.state;
  }

  getStatus(): string {
    return this.status;
  }

  public static builder(): MicroServiceBuilder {
    return new MicroServiceBuilder();
  }

  public static build(builder: MicroServiceBuilder): MicroService {
    return new MicroService(
      builder.getId(),
      builder.getNames(),
      builder.getCreated(),
      builder.getLabels(),
      builder.getState(),
      builder.getStatus()
    );
  }
}

class MicroServiceBuilder {
  private id!: string;
  private names!: string[];
  private created!: Date;
  private labels!: Labels;
  private state!: string;
  private status!: string;

  public getId(): string {
    return this.id;
  }

  public setId(id: string): MicroServiceBuilder {
    this.id = id;
    return this;
  }

  public getNames(): string[] {
    return this.names;
  }

  public setNames(names: string[]): MicroServiceBuilder {
    this.names = names;
    return this;
  }

  public getCreated(): Date {
    return this.created;
  }

  public setCreated(created: Date): MicroServiceBuilder {
    this.created = created;
    return this;
  }

  public getLabels(): Labels {
    return this.labels;
  }

  public setLabels(labels: Labels): MicroServiceBuilder {
    this.labels = labels;
    return this;
  }

  public getState(): string {
    return this.state;
  }

  public setState(state: string): MicroServiceBuilder {
    this.state = state;
    return this;
  }

  public getStatus(): string {
    return this.status;
  }

  public setStatus(status: string): MicroServiceBuilder {
    this.status = status;
    return this;
  }

  public build(): MicroService {
    return new MicroService(
      this.id,
      this.names,
      this.created,
      this.labels,
      this.state,
      this.status
    );
  }
}
