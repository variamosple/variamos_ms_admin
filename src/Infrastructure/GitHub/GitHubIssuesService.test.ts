import axios from "axios";
import logger from "jet-logger";
import {
  GitHubIssuesService,
  MAX_ISSUE_PAGES,
  nextPageOf,
} from "./GitHubIssuesService.js";

vi.mock("axios");

describe("GitHubIssuesService", () => {
  const service = new GitHubIssuesService();
  const issueUrl = "https://api.github.com/repos/owner/repo/issues/7";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, "err").mockImplementation(() => logger);
  });

  it("closes an issue as completed", async () => {
    vi.mocked(axios.patch).mockResolvedValue({});

    await expect(service.closeIssue("owner/repo", 7, "token")).resolves.toBe(
      true,
    );
    expect(axios.patch).toHaveBeenCalledWith(
      issueUrl,
      { state: "closed", state_reason: "completed" },
      expect.anything(),
    );
  });

  it("adds labels to an issue", async () => {
    vi.mocked(axios.post).mockResolvedValue({});

    await expect(
      service.addLabels("owner/repo", 7, ["in progress"], "token"),
    ).resolves.toBe(true);
    expect(axios.post).toHaveBeenCalledWith(
      `${issueUrl}/labels`,
      { labels: ["in progress"] },
      expect.anything(),
    );
  });

  it("removes a label, encoded in the address", async () => {
    vi.mocked(axios.delete).mockResolvedValue({});

    await expect(
      service.removeLabel("owner/repo", 7, "in progress", "token"),
    ).resolves.toBe(true);
    expect(axios.delete).toHaveBeenCalledWith(
      `${issueUrl}/labels/in%20progress`,
      expect.anything(),
    );
  });

  it("treats a label already absent as removed", async () => {
    vi.mocked(axios.delete).mockRejectedValue({ response: { status: 404 } });

    await expect(
      service.removeLabel("owner/repo", 7, "in progress", "token"),
    ).resolves.toBe(true);
    expect(logger.err).not.toHaveBeenCalled();
  });

  it("reports the other failures of a label change", async () => {
    vi.mocked(axios.delete).mockRejectedValue({ response: { status: 403 } });
    vi.mocked(axios.post).mockRejectedValue(new Error("network"));

    await expect(
      service.removeLabel("owner/repo", 7, "in progress", "token"),
    ).resolves.toBe(false);
    await expect(
      service.addLabels("owner/repo", 7, ["in progress"], "token"),
    ).resolves.toBe(false);
  });

  describe("getIssues (EV-101, OPT-10)", () => {
    const listUrl =
      "https://api.github.com/repos/owner/repo/issues?state=all&per_page=100";
    const page2 =
      "https://api.github.com/repositories/1/issues?state=all&per_page=100&page=2";
    const issue = (number: number) => ({ number }) as never;

    it("reads every page the Link header announces", async () => {
      vi.mocked(axios.get)
        .mockResolvedValueOnce({
          data: [issue(1), issue(2)],
          headers: {
            link: `<${page2}>; rel="next", <${page2}>; rel="last"`,
          },
        })
        .mockResolvedValueOnce({
          data: [issue(3)],
          headers: {
            link: `<${listUrl}>; rel="first", <${listUrl}>; rel="prev"`,
          },
        });

      const issues = await service.getIssues("owner/repo", "token");

      expect(issues?.map((i) => i.number)).toEqual([1, 2, 3]);
      expect(vi.mocked(axios.get).mock.calls.map(([url]) => url)).toEqual([
        listUrl,
        page2,
      ]);
    });

    it("returns null when a page cannot be read, never part of the issues", async () => {
      vi.mocked(axios.get)
        .mockResolvedValueOnce({
          data: [issue(1)],
          headers: { link: `<${page2}>; rel="next"` },
        })
        .mockRejectedValueOnce(new Error("rate limited"));

      await expect(
        service.getIssues("owner/repo", "token"),
      ).resolves.toBeNull();
    });

    it("stops at the page bound", async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: [issue(1)],
        headers: { link: `<${page2}>; rel="next"` },
      });

      await expect(
        service.getIssues("owner/repo", "token"),
      ).resolves.toBeNull();
      expect(axios.get).toHaveBeenCalledTimes(MAX_ISSUE_PAGES);
    });
  });

  describe("nextPageOf", () => {
    it("follows a GitHub API URL only, the token goes with it", () => {
      expect(nextPageOf(undefined)).toBeNull();
      expect(
        nextPageOf('<https://api.github.com/x?page=2>; rel="last"'),
      ).toBeNull();
      expect(
        nextPageOf('<https://evil.example/x?page=2>; rel="next"'),
      ).toBeNull();
      expect(nextPageOf('<https://api.github.com/x?page=2>; rel="next"')).toBe(
        "https://api.github.com/x?page=2",
      );
    });
  });
});
