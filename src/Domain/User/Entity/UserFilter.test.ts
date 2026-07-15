import { UserFilter } from "./UserFilter";

describe("UserFilter Entity - Unit Tests", () => {
  it("should build UserFilter using constructor", () => {
    const filter = new UserFilter("1", "user", "name", "email@test.com", "search", 1, 10);
    expect(filter.id).toBe("1");
    expect(filter.user).toBe("user");
    expect(filter.name).toBe("name");
    expect(filter.email).toBe("email@test.com");
    expect(filter.search).toBe("search");
    expect(filter.pageNumber).toBe(1);
    expect(filter.pageSize).toBe(10);
  });

  it("should build UserFilter using builder", () => {
    const filter = UserFilter.builder()
      .setId("2")
      .setUser("username")
      .setName("fullname")
      .setEmail("other@test.com")
      .setSearch("term")
      .setPageNumber(5)
      .setPageSize(25)
      .build();

    expect(filter.id).toBe("2");
    expect(filter.user).toBe("username");
    expect(filter.name).toBe("fullname");
    expect(filter.email).toBe("other@test.com");
    expect(filter.search).toBe("term");
    expect(filter.pageNumber).toBe(5);
    expect(filter.pageSize).toBe(25);
  });
});
