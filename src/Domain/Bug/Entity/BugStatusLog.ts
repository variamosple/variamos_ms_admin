export class BugStatusLog {
  public id?: number;
  public status!: string;
  public comment?: string;
  public changedAt?: Date;
  public bugId!: string;
  public changedById!: string;
  public changedBy?: any;

  constructor(builder: BugStatusLogBuilder) {
    Object.assign(this, builder);
  }

  public static builder() {
    return new BugStatusLogBuilder();
  }
}

class BugStatusLogBuilder {
  public id?: number;
  public status!: string;
  public comment?: string;
  public changedAt?: Date;
  public bugId!: string;
  public changedById!: string;
  public changedBy?: any;

  public setId(id?: number) {
    this.id = id;
    return this;
  }
  public setStatus(status: string) {
    this.status = status;
    return this;
  }
  public setComment(comment?: string) {
    this.comment = comment;
    return this;
  }
  public setChangedAt(changedAt?: Date) {
    this.changedAt = changedAt;
    return this;
  }
  public setBugId(bugId: string) {
    this.bugId = bugId;
    return this;
  }
  public setChangedById(changedById: string) {
    this.changedById = changedById;
    return this;
  }
  public setChangedBy(changedBy?: any) {
    this.changedBy = changedBy;
    return this;
  }

  public build() {
    return new BugStatusLog(this);
  }
}
