import { describe, expect, it } from "vitest";
import { canChangeStatus, statusFromGitHub } from "./BugStatus.js";

describe("canChangeStatus", () => {
  it.each([
    ["pending", "open"],
    ["open", "in_progress"],
    ["in_progress", "resolved"],
    ["resolved", "closed"],
    ["closed", "open"],
  ])("allows %s to %s", (from, to) => {
    expect(canChangeStatus(from, to)).toBe(true);
  });

  it.each([
    // Rejection, restoration and purge have their own routes
    ["pending", "rejected"],
    ["rejected", "pending"],
    ["open", "purged"],
    // Approval is the only way out of the inbox: it creates the issue
    ["pending", "in_progress"],
    ["closed", "resolved"],
    ["open", "open"],
    ["unknown", "open"],
  ])("refuses %s to %s", (from, to) => {
    expect(canChangeStatus(from, to)).toBe(false);
  });
});

describe("statusFromGitHub", () => {
  it.each([
    // New issue: GitHub decides
    ["open", undefined, "open"],
    ["closed", undefined, "closed"],
    // Open issue: the finer local status stays, a reopen is followed
    ["open", "in_progress", "in_progress"],
    ["open", "resolved", "open"],
    ["open", "closed", "open"],
    // Closed issue: a close is followed, Resolved stays
    ["closed", "open", "closed"],
    ["closed", "in_progress", "closed"],
    ["closed", "resolved", "resolved"],
    ["closed", "closed", "closed"],
  ])("issue %s, local %s: %s", (issueState, local, expected) => {
    expect(statusFromGitHub(issueState, local)).toBe(expected);
  });
});
