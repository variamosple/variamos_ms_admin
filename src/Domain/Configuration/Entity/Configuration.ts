export type ConfigurationValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, unknown>;

export type EnvironmentScope = "all" | "production" | "development" | "test";

// Value Object for enforcing configuration key patterns
export class ConfigurationKey {
  private readonly value: string;

  constructor(value: string) {
    if (!value || value.trim() === "") {
      throw new Error("Configuration key cannot be empty.");
    }
    const keyRegex = /^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/;
    if (!keyRegex.test(value)) {
      throw new Error(
        `Invalid configuration key format: '${value}'. Must be dot-separated words (e.g. category.name).`,
      );
    }
    this.value = value;
  }

  public getValue(): string {
    return this.value;
  }
}

export class Configuration {
  public readonly id?: number;
  public readonly key: ConfigurationKey;
  public value: ConfigurationValue;
  public readonly type: "boolean" | "string" | "number" | "array" | "object";
  public readonly category: "general" | "security" | "notification" | "env";
  public readonly requiresMfa: boolean;
  public readonly isSecret: boolean;
  public readonly environmentScope: EnvironmentScope;
  public readonly isReadOnly: boolean;
  public readonly targetServices: string[];
  public readonly description?: string;
  public updatedBy?: string;
  public createdAt?: Date;
  public updatedAt?: Date;

  public constructor(
    id: number | undefined,
    key: ConfigurationKey,
    value: ConfigurationValue,
    type: "boolean" | "string" | "number" | "array" | "object",
    category: "general" | "security" | "notification" | "env",
    requiresMfa: boolean,
    isSecret: boolean,
    environmentScope: EnvironmentScope,
    isReadOnly: boolean,
    targetServices: string[],
    description?: string,
    updatedBy?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    if (value === undefined || value === null) {
      throw new Error("Configuration value cannot be null or undefined.");
    }
    if (!type) {
      throw new Error("Configuration type is required.");
    }
    if (!category) {
      throw new Error("Configuration category is required.");
    }
    if (!targetServices || targetServices.length === 0) {
      throw new Error("At least one target service is required.");
    }

    // Strict type validation on instantiation
    Configuration.validateValueType(key.getValue(), value, type);

    this.id = id;
    this.key = key;
    this.value = value;
    this.type = type;
    this.category = category;
    this.requiresMfa = requiresMfa;
    this.isSecret = isSecret;
    this.environmentScope = environmentScope;
    this.isReadOnly = isReadOnly;
    this.targetServices = targetServices;
    this.description = description;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  /**
   * Modifies the value while guaranteeing domain invariants
   */
  public updateValue(newValue: ConfigurationValue, operatorId: string): void {
    if (this.isReadOnly) {
      throw new Error(
        `Configuration '${this.key.getValue()}' is read-only and cannot be updated.`,
      );
    }

    Configuration.validateValueType(this.key.getValue(), newValue, this.type);

    this.value = newValue;
    this.updatedBy = operatorId;
    this.updatedAt = new Date();
  }

  /**
   * Returns a masked representation of the value if it's a secret
   */
  public getDisplayValue(): ConfigurationValue {
    if (this.isSecret) {
      return "********";
    }
    return this.value;
  }

  private static validateValueType(
    key: string,
    val: ConfigurationValue,
    expectedType: "boolean" | "string" | "number" | "array" | "object",
  ): void {
    const typeofValue = typeof val;
    if (expectedType === "boolean" && typeofValue !== "boolean") {
      throw new Error(`Value for key '${key}' must be a boolean.`);
    }
    if (expectedType === "string" && typeofValue !== "string") {
      throw new Error(`Value for key '${key}' must be a string.`);
    }
    if (expectedType === "number" && typeofValue !== "number") {
      throw new Error(`Value for key '${key}' must be a number.`);
    }
    if (expectedType === "array" && !Array.isArray(val)) {
      throw new Error(`Value for key '${key}' must be an array.`);
    }
    if (
      expectedType === "object" &&
      (typeofValue !== "object" || Array.isArray(val))
    ) {
      throw new Error(`Value for key '${key}' must be an object.`);
    }
  }

  public static builder(): ConfigurationBuilder {
    return new ConfigurationBuilder();
  }
}

export class ConfigurationBuilder {
  private id?: number;
  private key?: ConfigurationKey;
  private value?: ConfigurationValue;
  private type?: "boolean" | "string" | "number" | "array" | "object";
  private category?: "general" | "security" | "notification" | "env";
  private requiresMfa = false;
  private isSecret = false;
  private environmentScope: EnvironmentScope = "all";
  private isReadOnly = false;
  private targetServices: string[] = [];
  private description?: string;
  private updatedBy?: string;
  private createdAt?: Date;
  private updatedAt?: Date;

  public setId(id?: number): this {
    this.id = id;
    return this;
  }
  public setKey(key: ConfigurationKey): this {
    this.key = key;
    return this;
  }
  public setValue(value: ConfigurationValue): this {
    this.value = value;
    return this;
  }
  public setType(
    type: "boolean" | "string" | "number" | "array" | "object",
  ): this {
    this.type = type;
    return this;
  }
  public setCategory(
    category: "general" | "security" | "notification" | "env",
  ): this {
    this.category = category;
    return this;
  }
  public setRequiresMfa(requiresMfa: boolean): this {
    this.requiresMfa = requiresMfa;
    return this;
  }
  public setIsSecret(isSecret: boolean): this {
    this.isSecret = isSecret;
    return this;
  }
  public setEnvironmentScope(environmentScope: EnvironmentScope): this {
    this.environmentScope = environmentScope;
    return this;
  }
  public setIsReadOnly(isReadOnly: boolean): this {
    this.isReadOnly = isReadOnly;
    return this;
  }
  public setTargetServices(targetServices: string[]): this {
    this.targetServices = targetServices;
    return this;
  }
  public setDescription(description?: string): this {
    this.description = description;
    return this;
  }
  public setUpdatedBy(updatedBy?: string): this {
    this.updatedBy = updatedBy;
    return this;
  }
  public setCreatedAt(createdAt?: Date): this {
    this.createdAt = createdAt;
    return this;
  }
  public setUpdatedAt(updatedAt?: Date): this {
    this.updatedAt = updatedAt;
    return this;
  }

  public getId(): number | undefined {
    return this.id;
  }
  public getKey(): ConfigurationKey | undefined {
    return this.key;
  }
  public getValue(): ConfigurationValue | undefined {
    return this.value;
  }
  public getType():
    | "boolean"
    | "string"
    | "number"
    | "array"
    | "object"
    | undefined {
    return this.type;
  }
  public getCategory():
    | "general"
    | "security"
    | "notification"
    | "env"
    | undefined {
    return this.category;
  }
  public getRequiresMfa(): boolean {
    return this.requiresMfa;
  }
  public getIsSecret(): boolean {
    return this.isSecret;
  }
  public getEnvironmentScope(): EnvironmentScope {
    return this.environmentScope;
  }
  public getIsReadOnly(): boolean {
    return this.isReadOnly;
  }
  public getTargetServices(): string[] {
    return this.targetServices;
  }
  public getDescription(): string | undefined {
    return this.description;
  }
  public getUpdatedBy(): string | undefined {
    return this.updatedBy;
  }
  public getCreatedAt(): Date | undefined {
    return this.createdAt;
  }
  public getUpdatedAt(): Date | undefined {
    return this.updatedAt;
  }

  public build(): Configuration {
    if (!this.key) {
      throw new Error("Configuration key is required.");
    }
    return new Configuration(
      this.id,
      this.key,
      this.value ?? "",
      this.type ?? "string",
      this.category ?? "general",
      this.requiresMfa,
      this.isSecret,
      this.environmentScope,
      this.isReadOnly,
      this.targetServices,
      this.description,
      this.updatedBy,
      this.createdAt,
      this.updatedAt,
    );
  }
}
