export class Bug {
  public id!: string;
  public title!: string;
  public description!: string;
  public priority!: "low" | "medium" | "high";
  public category?: string;
  public status!: string;
  public githubRepo!: string;
  public gitIssueNumber!: number;
  public githubCreator!: string;
  public githubHtmlUrl!: string;
  public githubAssignee?: string;
  public createdById?: string;
  public reporterEmail?: string;
  public updatedById?: string;
  public createdAt!: Date;
  public updatedAt!: Date;
  public createdBy?: any;
  public updatedBy?: any;
  public attachments?: any[];
  public assignedAdmins?: any[];

  constructor(builder: BugBuilder) {
    Object.assign(this, builder);
  }

  public get creatorName(): string {
    return this.createdBy ? this.createdBy.name : "Guest";
  }

  public static builder(): BugBuilder {
    return new BugBuilder();
  }
}

class BugBuilder {
  public id?: string;
  public title!: string;
  public description!: string;
  public priority!: "low" | "medium" | "high";
  public category?: string;
  public status!: string;
  public githubRepo?: string;
  public gitIssueNumber?: number;
  public githubCreator?: string;
  public githubHtmlUrl?: string;
  public githubAssignee?: string;
  public createdById?: string;
  public reporterEmail?: string;
  public updatedById?: string;
  public createdAt?: Date;
  public updatedAt?: Date;
  public createdBy?: any;
  public updatedBy?: any;
  public attachments?: any[];
  public assignedAdmins?: any[];

  public setId(id?: string) {
    this.id = id;
    return this;
  }
  public setTitle(title: string) {
    this.title = title;
    return this;
  }
  public setDescription(description: string) {
    this.description = description;
    return this;
  }
  public setPriority(priority: "low" | "medium" | "high") {
    this.priority = priority;
    return this;
  }
  public setCategory(category?: string) {
    this.category = category;
    return this;
  }
  public setStatus(status: string) {
    this.status = status;
    return this;
  }
  public setGithubRepo(githubRepo?: string) {
    this.githubRepo = githubRepo;
    return this;
  }
  public setGitIssueNumber(gitIssueNumber?: number) {
    this.gitIssueNumber = gitIssueNumber;
    return this;
  }
  public setGithubCreator(githubCreator?: string) {
    this.githubCreator = githubCreator;
    return this;
  }
  public setGithubHtmlUrl(githubHtmlUrl?: string) {
    this.githubHtmlUrl = githubHtmlUrl;
    return this;
  }
  public setGithubAssignee(githubAssignee?: string) {
    this.githubAssignee = githubAssignee;
    return this;
  }
  public setCreatedById(createdById?: string) {
    this.createdById = createdById;
    return this;
  }
  public setReporterEmail(reporterEmail?: string) {
    this.reporterEmail = reporterEmail;
    return this;
  }
  public setUpdatedById(updatedById?: string) {
    this.updatedById = updatedById;
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
  public setCreatedBy(createdBy?: any) {
    this.createdBy = createdBy;
    return this;
  }
  public setUpdatedBy(updatedBy?: any) {
    this.updatedBy = updatedBy;
    return this;
  }
  public setAttachments(attachments?: any[]) {
    this.attachments = attachments;
    return this;
  }
  public setAssignedAdmins(assignedAdmins?: any[]) {
    this.assignedAdmins = assignedAdmins;
    return this;
  }

  public build(): Bug {
    return new Bug(this);
  }
}
