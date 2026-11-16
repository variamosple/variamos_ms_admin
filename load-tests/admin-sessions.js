// Load scenario of the administration API (EV-92), for k6.
//
// A virtual user is one administrator: signed in, opening the screens the
// administrators use most, with 1 to 3 s of reading between two actions.
// "200 concurrent users" is read as 200 such administrators at once, not 200
// simultaneous requests (MA-NF-05).
//
// SIGN_IN chooses when they sign in:
// - "once" (default): at the first iteration, and again only when the session
//   has expired. An administrator signs in, then works: with a bcrypt cost of
//   12, signing in at each round would measure the password hash more than
//   the screens;
// - "each": sign in and sign out at each round, as the campaign of 2026-11-03
//   did, to compare with it.
//
// PEAK is the number of administrators of the last step (default 200); the
// ramp holds a quarter, then a half of it first. ABORT_P95, in milliseconds,
// stops the run as soon as the 95th percentile of all requests goes above it,
// or more than 5 % of the requests fail: for a run on a shared server.
//
// By default, each virtual user has its own account from seed.sql, and the
// password is the one given to the seed, never a real account:
//   k6 run -e BASE_URL=http://localhost:4000 -e PASSWORD=... admin-sessions.js
// EMAIL gives one account to all the virtual users instead: a test account
// made for a short run on a real server, with its own throwaway password.
import { check, sleep } from "k6";
import http from "k6/http";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const PASSWORD = __ENV.PASSWORD;
const ACCOUNTS = Number(__ENV.ACCOUNTS || 200);
const EMAIL = __ENV.EMAIL || "";
const SIGN_IN = __ENV.SIGN_IN || "once";
const PEAK = Number(__ENV.PEAK || 200);
// HOLD shortens the plateau for a trial run ("1m"); the campaign keeps 15 min
const HOLD = __ENV.HOLD || "15m";
const ABORT_P95 = Number(__ENV.ABORT_P95 || 0);

if (!PASSWORD) {
  throw new Error("PASSWORD is required: the one given to seed.sql or EMAIL");
}
if (SIGN_IN !== "once" && SIGN_IN !== "each") {
  throw new Error(`SIGN_IN is "once" or "each", not "${SIGN_IN}"`);
}

// MA-NF-06: under 2 s on average and under 3 s at the 95th percentile, for
// each action; under 1 % of failed requests (proposed in EV-92). Signing out
// happens only when each round signs in.
const ACTIONS = [
  "sign-in",
  "session-info",
  "users",
  "micro-services",
  "bugs",
  "metrics",
  ...(SIGN_IN === "each" ? ["sign-out"] : []),
];
const thresholds = { http_req_failed: ["rate<0.01"] };
for (const action of ACTIONS) {
  thresholds[`http_req_duration{action:${action}}`] = [
    "avg<2000",
    "p(95)<3000",
  ];
}
if (ABORT_P95 > 0) {
  // Evaluated over the whole run so far, from 30 s on
  const stop = (threshold) => ({
    threshold,
    abortOnFail: true,
    delayAbortEval: "30s",
  });
  thresholds.http_req_duration = [stop(`p(95)<${ABORT_P95}`)];
  thresholds.http_req_failed.push(stop("rate<0.05"));
}

const step = (share) => Math.max(1, Math.round(PEAK * share));

export const options = {
  scenarios: {
    sessions: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: step(0.25) },
        { duration: "3m", target: step(0.25) },
        { duration: "1m", target: step(0.5) },
        { duration: "3m", target: step(0.5) },
        { duration: "1m", target: PEAK },
        { duration: HOLD, target: PEAK },
        { duration: "1m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  // k6 empties the cookies at each round by default: the session cookie must
  // last across rounds when signing in once
  noCookiesReset: true,
  thresholds,
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const think = () => sleep(1 + Math.random() * 2);

// Each virtual user comes from its own address, as each administrator does
// behind the proxy in production: the limits per address (RateLimits.ts) see
// 200 people, not one. 198.18.0.0/15 is reserved for benchmarks (RFC 2544).
// Through nginx, the proxy keeps the address it sees: the header is harmless.
const address = () => `198.18.${Math.floor(__VU / 256)}.${__VU % 256}`;
const headers = () => ({ "X-Forwarded-For": address() });

// Each virtual user keeps its own cookies, and its own account unless EMAIL
// names one for all
const email = () =>
  EMAIL ||
  `load-admin-${String(((__VU - 1) % ACCOUNTS) + 1).padStart(3, "0")}@loadtest.invalid`;

// Per virtual user: k6 gives each one its own copy of this module
let signedIn = false;

function signIn() {
  const res = http.post(
    `${BASE_URL}/auth/sign-in`,
    JSON.stringify({
      email: email(),
      password: PASSWORD,
    }),
    {
      headers: { ...headers(), "Content-Type": "application/json" },
      tags: { action: "sign-in" },
    },
  );
  return check(res, { "sign-in 200": (r) => r.status === 200 });
}

function get(action, path) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: headers(),
    tags: { action },
  });
  check(res, { [`${action} 200`]: (r) => r.status === 200 });
  // An expired session signs in again at the next round
  if (res.status === 401) signedIn = false;
  return res;
}

function signOut() {
  const res = http.post(`${BASE_URL}/auth/logout`, null, {
    headers: headers(),
    tags: { action: "sign-out" },
  });
  check(res, { "sign-out 2xx": (r) => r.status >= 200 && r.status < 300 });
  http.cookieJar().clear(BASE_URL);
  signedIn = false;
}

export default function session() {
  if (!signedIn) {
    signedIn = signIn();
    think();
    if (!signedIn) return;
  }

  const day = (d) => d.toISOString().slice(0, 10);
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 3600 * 1000);
  const period = `startDate=${day(start)}&endDate=${day(end)}`;
  const screens = [
    ["session-info", "/auth/session-info"],
    ["users", "/v1/users?pageNumber=1&pageSize=10"],
    ["micro-services", "/v1/micro-services"],
    ["bugs", "/bugs?pageNumber=1&pageSize=20"],
    // As the dashboard asks: a period, in the time zone of the reader
    ["metrics", `/v1/metrics?${period}&timeZone=America%2FBogota`],
  ];
  for (const [action, path] of screens) {
    get(action, path);
    think();
    if (!signedIn) return;
  }

  if (SIGN_IN === "each") {
    signOut();
    think();
  }
}
