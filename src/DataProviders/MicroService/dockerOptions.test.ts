import { dockerOptionsOf } from "./dockerOptions.js";

const SOCKET = "/var/run/docker.sock";

describe("dockerOptionsOf (EV-71 lot 2)", () => {
  it("opens the socket when no proxy is named", () => {
    expect(dockerOptionsOf({ host: "", socketPath: SOCKET })).toEqual({
      socketPath: SOCKET,
    });
    expect(dockerOptionsOf({ host: "  ", socketPath: SOCKET })).toEqual({
      socketPath: SOCKET,
    });
  });

  it("goes through the socket proxy named by DOCKER_HOST, over HTTP", () => {
    expect(
      dockerOptionsOf({
        host: "tcp://docker-socket-proxy:2375",
        socketPath: SOCKET,
      }),
    ).toEqual({ protocol: "http", host: "docker-socket-proxy", port: 2375 });
    expect(
      dockerOptionsOf({ host: "http://proxy:2380", socketPath: "" }),
    ).toEqual({ protocol: "http", host: "proxy", port: 2380 });
  });

  it("takes 2375, the proxy's port, when DOCKER_HOST names none", () => {
    expect(dockerOptionsOf({ host: "tcp://proxy", socketPath: "" })).toEqual({
      protocol: "http",
      host: "proxy",
      port: 2375,
    });
  });

  it("reads a unix socket written as DOCKER_HOST", () => {
    expect(
      dockerOptionsOf({ host: "unix:///run/docker.sock", socketPath: SOCKET }),
    ).toEqual({ socketPath: "/run/docker.sock" });
  });

  it.each(["https://proxy:2376", "ssh://user@host"])(
    "refuses %j, which the proxy does not speak",
    (host) => {
      expect(() => dockerOptionsOf({ host, socketPath: SOCKET })).toThrow(
        "DOCKER_HOST must be tcp://<host>:<port> or unix://<path>",
      );
    },
  );
});
