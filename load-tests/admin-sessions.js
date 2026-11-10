// Load scenario of the administration API (EV-92), for k6.
//
// One iteration is one administrator session: sign in, open the screens the
// administrators use most, sign out, with 1 to 3 s of reading between two
// actions. "200 concurrent users" is read as 200 such sessions running at
// once, not 200 simultaneous requests (MA-NF-05).
//
// Run against a local backend only: the accounts come from seed.sql, and the
// password is the one given to the seed, never a real account.
//   k6 run -e BASE_URL=http://localhost:4000 -e PASSWORD=... admin-sessions.js
import { check, group, sleep } from "k6";
import http from "k6/http";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const PASSWORD = __ENV.PASSWORD;
const ACCOUNTS = Number(__ENV.ACCOUNTS || 200);
// HOLD shortens the plateau for a trial run ("1m"); the campaign keeps 15 min
const HOLD = __ENV.HOLD || "15m";

if (!PASSWORD) {
  throw new Error("PASSWORD is required: the one given to seed.sql");
}

// MA-NF-06: under 2 s on average and under 3 s at the 95th percentile, for
// each action; under 1 % of failed requests (proposed in EV-92)
const ACTIONS = [
  "sign-in",
  "session-info",
  "users",
  "micro-services",
  "bugs",
  "metrics",
  "metric-daily-visits",
  "sign-out",
];
const thresholds = { http_req_failed: ["rate<0.01"] };
for (const action of ACTIONS) {
  thresholds[`http_req_duration{action:${action}}`] = [
    "avg<2000",
    "p(95)<3000",
  ];
}

export const options = {
  scenarios: {
    sessions: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 50 },
        { duration: "3m", target: 50 },
        { duration: "1m", target: 100 },
        { duration: "3m", target: 100 },
        { duration: "1m", target: 200 },
        { duration: HOLD, target: 200 },
        { duration: "1m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds,
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const think = () => sleep(1 + Math.random() * 2);

// Each virtual user comes from its own address, as each administrator does
// behind the proxy in production: the limits per address (RateLimits.ts) see
// 200 people, not one. 198.18.0.0/15 is reserved for benchmarks (RFC 2544).
const address = () => `198.18.${Math.floor(__VU / 256)}.${__VU % 256}`;
const headers = () => ({ "X-Forwarded-For": address() });

function get(action, path) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: headers(),
    tags: { action },
  });
  check(res, { [`${action} 200`]: (r) => r.status === 200 });
  return res;
}

export default function session() {
  // Each virtual user keeps its own account: no two sessions share a cookie
  const account = String(((__VU - 1) % ACCOUNTS) + 1).padStart(3, "0");
  const email = `load-admin-${account}@loadtest.invalid`;

  const signIn = http.post(
    `${BASE_URL}/auth/sign-in`,
    JSON.stringify({ email, password: PASSWORD }),
    {
      headers: { ...headers(), "Content-Type": "application/json" },
      tags: { action: "sign-in" },
    },
  );
  if (!check(signIn, { "sign-in 200": (r) => r.status === 200 })) {
    think();
    return;
  }
  think();

  group("screens", () => {
    get("session-info", "/auth/session-info");
    think();
    get("users", "/v1/users?pageNumber=1&pageSize=10");
    think();
    get("micro-services", "/v1/micro-services");
    think();
    get("bugs", "/bugs?pageNumber=1&pageSize=20");
    think();
    get("metrics", "/v1/metrics");
    think();
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 3600 * 1000);
    const day = (d) => d.toISOString().slice(0, 10);
    get(
      "metric-daily-visits",
      `/v1/metrics/daily_visits?startDate=${day(start)}&endDate=${day(end)}`,
    );
    think();
  });

  const signOut = http.post(`${BASE_URL}/auth/logout`, null, {
    headers: headers(),
    tags: { action: "sign-out" },
  });
  check(signOut, { "sign-out 2xx": (r) => r.status >= 200 && r.status < 300 });
  http.cookieJar().clear(BASE_URL);
  think();
}
