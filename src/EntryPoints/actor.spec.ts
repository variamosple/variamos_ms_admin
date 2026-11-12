import type { SessionUser } from "@variamosple/variamos-security";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { actorOf, signedInUser } from "./actor.js";

const operator: SessionUser = {
  id: "operator-1",
  name: "Operator",
  user: "operator",
  email: "operator@example.com",
};

const requestOf = (user: SessionUser | null): Request =>
  Object.assign(Object.create(null), { user });

describe("actorOf", () => {
  it("gives the id of the signed-in user, or nothing", () => {
    expect(actorOf(requestOf(operator))).toBe("operator-1");
    expect(actorOf(requestOf(null))).toBeUndefined();
  });
});

describe("signedInUser", () => {
  it("gives the user set by isAuthenticated", () => {
    expect(signedInUser(requestOf(operator))).toBe(operator);
  });

  it("throws when the route is not behind isAuthenticated", () => {
    expect(() => signedInUser(requestOf(null))).toThrow(
      "No signed-in user: the route must sit behind isAuthenticated.",
    );
  });
});
