export class Country {
  private code: string;
  private name: string;
  private latitude: number;
  private longitude: number;

  constructor(code: string, name: string, latitude: number, longitude: number) {
    this.code = code;
    this.name = name;
    this.latitude = latitude;
    this.longitude = longitude;
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

  public static builder(): CountryBuilder {
    return new CountryBuilder();
  }

  public static build(builder: CountryBuilder): Country {
    return new Country(
      builder.getCode(),
      builder.getName(),
      builder.getLatitude(),
      builder.getLongitude()
    );
  }
}

class CountryBuilder {
  private code!: string;
  private name!: string;
  private latitude!: number;
  private longitude!: number;

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

  public build(): Country {
    return new Country(this.code, this.name, this.latitude, this.longitude);
  }
}
