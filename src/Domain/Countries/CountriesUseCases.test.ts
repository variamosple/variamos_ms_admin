import { CountriesUseCases } from "./CountriesUseCases";
import { ICountriesRepository } from "./Repository/ICountriesRepository";
import { Country } from "./Entity/Country";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";

describe("Countries Module Unit Tests", () => {
  describe("Country Entity & Builder", () => {
    it("should correctly build a Country entity using the builder pattern", () => {
      const country = Country.builder()
        .setCode("FR")
        .setName("France")
        .setLatitude(46.2276)
        .setLongitude(2.2137)
        .build();

      expect(country.getCode()).toBe("FR");
      expect(country.getName()).toBe("France");
      expect(country.getLatitude()).toBe(46.2276);
      expect(country.getLongitude()).toBe(2.2137);

      // Verify static build method
      const builder = Country.builder()
        .setCode("US")
        .setName("United States")
        .setLatitude(37.0902)
        .setLongitude(-95.7129);
      const country2 = Country.build(builder);
      expect(country2.getCode()).toBe("US");
    });
  });

  describe("CountriesUseCases", () => {
    it("should forward getCountries call to the ICountriesRepository", async () => {
      const mockCountries = [
        Country.builder()
          .setCode("FR")
          .setName("France")
          .setLatitude(46.2)
          .setLongitude(2.2)
          .build(),
      ];
      const mockResponse = new ResponseModel<Country[]>("getCountries").withResponse(mockCountries);

      // Create a mock of the pure Domain Interface (no data provider imports needed!)
      const mockCountriesRepository: jest.Mocked<ICountriesRepository> = {
        getCountries: jest.fn().mockResolvedValue(mockResponse),
        getUserCountryCode: jest.fn(),
        getIpCountryCode: jest.fn(),
      };

      const request = new RequestModel<void>("getCountries");
      const useCases = new CountriesUseCases(mockCountriesRepository);
      const result = await useCases.getCountries(request);

      expect(mockCountriesRepository.getCountries).toHaveBeenCalledWith(request);
      expect(result).toEqual(mockResponse);
    });
  });
});
