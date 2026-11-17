# Load tests (EV-92)

A k6 scenario that measures the administration API under load, on a local
environment with synthetic data. It answers two requirements of the
specification:

- MA-NF-05: 200 concurrent users without notable degradation;
- MA-NF-06: each administrative action under 2 s on average and under 3 s at
  the 95th percentile.

The results of each campaign are kept in the documentation of the project
(`docs/audits/` of the VariaMos workspace), not in this repository.

## What runs

| File | Role |
| --- | --- |
| `up.sh` | Starts the environment on an internal Docker network: PostgreSQL 14 with the schema of the frontend end-to-end tests, seven stand-in services that answer `/health`, and the admin image. |
| `seed.sql` | Synthetic data: 200 administrators, 3,000 users, 30 days of health checks for 8 services (86,400 per service), 1,500 bugs, one year of page visits. |
| `admin-sessions.js` | The k6 scenario. |
| `monitor.sh` | Every 5 s while k6 runs: CPU and memory of the admin and database containers, connections the admin holds on PostgreSQL. |
| `down.sh` | Stops every container of the environment and removes its network. |

Nothing leaves the machine: the network is internal, so the GitHub
synchronization and the notification service are unreachable, as intended.
No production file, account or data is used; every password and key is a
throwaway made for the run.

The admin container reads the Docker socket of the host, as in production, to
list the monitored services. It sees the other containers of the host but
monitors only those labelled `variamos.service.monitored=true`.

## Load model

A virtual user is one administrator. It signs in, then goes round the
screens: session information, list of users, list of microservices (with
their uptime), list of bugs, statistics page over 30 days in a time zone, as
the interface asks for it. Between two actions, the user reads for 1 to 3 s.

`SIGN_IN` chooses when it signs in:

- `once` (default): at its first round, and again only if the session has
  expired. An administrator signs in once, then works; with a bcrypt cost of
  12, signing in at each round would measure the password hash more than the
  screens.
- `each`: sign in, the screens, sign out, at each round, as the campaign of
  2026-11-03 did.

"200 concurrent users" is read as 200 such administrators at once, not 200
simultaneous requests. Each virtual user sends its own address in
`X-Forwarded-For` (in 198.18.0.0/15, reserved for benchmarks), as the proxy
does for each administrator in production. Without it, the limits per address
see a single client: the sign-in limit answers `429` once 100 sign-ins are in
flight, and the campaign measures refusals.

The ramp holds a quarter, then a half of `PEAK` (default 200) for 3 min each,
then `PEAK` for 15 min (`HOLD`, shorter for a trial run).

Thresholds, per action: average under 2,000 ms, 95th percentile under
3,000 ms; under 1 % of failed requests overall. A threshold that fails makes
k6 exit with a non-zero code. `ABORT_P95` (in ms) also stops the run as soon
as the 95th percentile of all requests goes above it, or 5 % of the requests
fail: for a short run on a shared server. `EMAIL` then gives one test account
to all the virtual users, with its own password.
`SKIP` leaves screens out (`SKIP=users`): the test account of a real server
holds only the read permissions of the screens it opens, never
`users::query`, so that it reads no personal data.

## Run a campaign

Prerequisites: Docker, and a checkout of `VariaMosAdmin` next to this
repository (for `tests/db`).

```bash
# 1. The image under test, from the commit to measure
docker build -t variamos-admin:load .

# 2. A throwaway key pair for the session tokens, and a throwaway password
mkdir -p /tmp/load-keys
openssl genrsa -out /tmp/load-keys/jwtRS256.key 2048
openssl rsa -in /tmp/load-keys/jwtRS256.key -pubout -out /tmp/load-keys/jwtRS256.key.pub
chmod 644 /tmp/load-keys/*
PASSWORD="Lt-$(openssl rand -hex 8)!A1"

# 3. The environment, then the data (after the migrations). CPUSET=0,1 puts
#    the database and the admin on two processors, the size of the production
#    server (k6 then runs on others, 4-7 below); cost=12 is the bcrypt cost
#    of production (EV-46).
CPUSET=0,1 bash load-tests/up.sh variamos-admin:load /tmp/load-keys ../VariaMosAdmin
docker exec -i ev92-pg psql -q -U variamos_admin -d VariamosDB \
  -v password="$PASSWORD" -v cost=12 < load-tests/seed.sql

# 4. The campaign (about 26 min), and the resources beside it
mkdir -p load-results && chmod 777 load-results
docker run -d --name ev92-k6 --network ev92-net --cpuset-cpus 4-7 \
  -v "$PWD/load-tests:/scripts:ro" -v "$PWD/load-results:/results" \
  grafana/k6:1.3.0 run --summary-export=/results/summary.json \
  -e BASE_URL=http://ev92-admin:4000 -e PASSWORD="$PASSWORD" /scripts/admin-sessions.js
bash load-tests/monitor.sh load-results/resources.csv
docker logs ev92-k6 > load-results/k6.txt 2>&1
docker rm ev92-k6

# 5. Clean up
bash load-tests/down.sh
```

For a short trial, add `-e HOLD=1m` to the k6 command.

## Short run on the production server

At most 50 sessions, at a quiet hour told to the team, with one test account
for all of them (first run on 2026-11-17: 0 failure, 95th percentile 252 ms
from a workstation, network included).

1. In the administration: the role `EV-92 load test` holds only
   `micro-services::query`, `bugs::query` and `metrics::query`, never
   `users::query`. Create the account by the normal sign-up, with an address
   you control and a generated password that is written nowhere, without a
   second factor; give it the role.
2. Trial with one session, from this folder; every check must pass (a 403
   means the role lacks a permission):

   ```bash
   read -rsp "Password of the test account: " PASSWORD; echo; export PASSWORD
   docker run --rm -i -e PASSWORD grafana/k6:1.3.0 run \
     -e BASE_URL=https://app.variamos.com/variamos_ms_admin \
     -e EMAIL=<test account> -e SKIP=users \
     --vus 1 --iterations 1 - < admin-sessions.js
   ```

3. The run (about 15 min), stopped as soon as the 95th percentile goes above
   1.5 s or 5 % of the requests fail. The container runs as you, so that it
   may write the summary, outside the repository:

   ```bash
   mkdir -p /tmp/ev92-results
   docker run --rm -i -e PASSWORD --user "$(id -u)" -v /tmp/ev92-results:/out \
     grafana/k6:1.3.0 run \
     -e BASE_URL=https://app.variamos.com/variamos_ms_admin \
     -e EMAIL=<test account> -e SKIP=users \
     -e PEAK=50 -e HOLD=5m -e ABORT_P95=1500 \
     --summary-export=/out/prod-50.json - < admin-sessions.js
   unset PASSWORD
   ```

4. Right after: disable or delete the account; the role stays, without any
   member. A session opened before lasts until its token expires.

## Not covered yet

- Sending a notification to a group: it needs the notification service.
- The external probe and the availability requirement (MA-NF-11).
- A nightly run in CI: it needs a dedicated environment.
