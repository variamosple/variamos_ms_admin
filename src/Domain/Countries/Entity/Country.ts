export class Country {
  private readonly code: string;
  private readonly name: string;
  private readonly latitude: number;
  private readonly longitude: number;
  private readonly code3: string;

  public constructor(
    code: string,
    name: string,
    latitude: number,
    longitude: number,
    code3: string,
  ) {
    if (!code || !/^[A-Z]{2}$/.test(code)) {
      throw new Error("Country code must be exactly 2 uppercase letters.");
    }
    if (!code3 || !/^[A-Z]{3}$/.test(code3)) {
      throw new Error("Country code3 must be exactly 3 uppercase letters.");
    }
    if (!name || name.trim() === "") {
      throw new Error("Country name is required.");
    }
    if (typeof latitude !== "number" || Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
      throw new Error("Latitude must be a valid number between -90 and 90.");
    }
    if (
      typeof longitude !== "number" ||
      Number.isNaN(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error("Longitude must be a valid number between -180 and 180.");
    }

    this.code = code;
    this.name = name.trim();
    this.latitude = latitude;
    this.longitude = longitude;
    this.code3 = code3;
  }

  public getCode(): string {
    return this.code;
  }

  public getName(): string {
    return this.name;
  }

  public getLatitude(): number {
    return this.latitude;
  }

  public getLongitude(): number {
    return this.longitude;
  }

  public getCode3(): string {
    return this.code3;
  }

  public static builder(): CountryBuilder {
    return new CountryBuilder();
  }

  public static build(builder: CountryBuilder): Country {
    return new Country(
      builder.getCode(),
      builder.getName(),
      builder.getLatitude(),
      builder.getLongitude(),
      builder.getCode3(),
    );
  }
}

export class CountryBuilder {
  private code!: string;
  private name!: string;
  private latitude!: number;
  private longitude!: number;
  private code3!: string;

  public getCode(): string {
    return this.code;
  }

  public setCode(code: string): CountryBuilder {
    this.code = code;
    return this;
  }

  public getName(): string {
    return this.name;
  }

  public setName(name: string): CountryBuilder {
    this.name = name;
    return this;
  }

  public getLatitude(): number {
    return this.latitude;
  }

  public setLatitude(latitude: number): CountryBuilder {
    this.latitude = latitude;
    return this;
  }

  public getLongitude(): number {
    return this.longitude;
  }

  public setLongitude(longitude: number): CountryBuilder {
    this.longitude = longitude;
    return this;
  }

  public getCode3(): string {
    return this.code3;
  }

  public setCode3(code3: string): CountryBuilder {
    this.code3 = code3;
    return this;
  }

  public build(): Country {
    return new Country(this.code, this.name, this.latitude, this.longitude, this.code3);
  }
}
