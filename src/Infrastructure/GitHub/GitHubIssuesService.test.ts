import axios from "axios";
import logger from "jet-logger";
import { GitHubIssuesService } from "./GitHubIssuesService.js";

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
});
