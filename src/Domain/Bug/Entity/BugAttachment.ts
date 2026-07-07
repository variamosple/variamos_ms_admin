export class BugAttachment {
  public id?: number;
  public filePath!: string;
  public fileType!: string;
  public bugId!: string;
  public createdAt?: Date;

  public constructor(builder: BugAttachmentBuilder) {
    Object.assign(this, builder);
  }

  public static builder() {
    return new BugAttachmentBuilder();
  }
}

class BugAttachmentBuilder {
  public id?: number;
  public filePath!: string;
  public fileType!: string;
  public bugId!: string;
  public createdAt?: Date;

  public setId(id?: number) {
    this.id = id;
    return this;
  }
  public setFilePath(filePath: string) {
    this.filePath = filePath;
    return this;
  }
  public setFileType(fileType: string) {
    this.fileType = fileType;
    return this;
  }
  public setBugId(bugId: string) {
    this.bugId = bugId;
    return this;
  }
  public setCreatedAt(createdAt?: Date) {
    this.createdAt = createdAt;
    return this;
  }

  public build() {
    return new BugAttachment(this);
  }
}
