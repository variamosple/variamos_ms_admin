import { readFileSync } from "node:fs";

/**
 * The container runs node itself, so that it gets the SIGTERM of docker
 * stop (ADM-N21): its command must stay the "start" script of package.json.
 */
describe("Dockerfile command", () => {
  it("runs the start script of package.json with node, not npm", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: { start: string };
    };
    const cmd = /^CMD (\[.*\])$/m.exec(dockerfile)?.[1];

    expect(cmd).toBeDefined();
    expect(JSON.parse(cmd ?? "[]")).toEqual(
      packageJson.scripts.start.split(" "),
    );
  });
});
