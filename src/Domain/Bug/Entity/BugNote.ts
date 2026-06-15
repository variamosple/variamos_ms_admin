export class BugNote {
  public id?: number;
  public body!: string;
  public gitCommentId?: number;
  public bugId!: string;
  public authorId!: string;
  public createdAt?: Date;
  public updatedAt?: Date;
  public author?: any;

  constructor(builder: BugNoteBuilder) {
    Object.assign(this, builder);
  }

  public static builder() {
    return new BugNoteBuilder();
  }
}

class BugNoteBuilder {
  public id?: number;
  public body!: string;
  public gitCommentId?: number;
  public bugId!: string;
  public authorId!: string;
  public createdAt?: Date;
  public updatedAt?: Date;
  public author?: any;

  public setId(id?: number) {
    this.id = id;
    return this;
  }
  public setBody(body: string) {
    this.body = body;
    return this;
  }
  public setGitCommentId(gitCommentId?: number) {
    this.gitCommentId = gitCommentId;
    return this;
  }
  public setBugId(bugId: string) {
    this.bugId = bugId;
    return this;
  }
  public setAuthorId(authorId: string) {
    this.authorId = authorId;
    return this;
  }
  public setCreatedAt(createdAt?: Date) {
    this.createdAt = createdAt;
    return this;
  }
  public setUpdatedAt(updatedAt?: Date) {
    this.updatedAt = updatedAt;
    return this;
  }
  public setAuthor(author?: any) {
    this.author = author;
    return this;
  }

  public build() {
    return new BugNote(this);
  }
}
