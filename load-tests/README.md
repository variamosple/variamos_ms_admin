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

One k6 iteration is one administrator session: sign in, session information,
list of users, list of microservices (with their uptime), list of bugs,
metrics dashboard, one chart of daily visits, sign out. Between two actions,
the user reads for 1 to 3 s.

"200 concurrent users" is read as 200 such sessions at once, not 200
simultaneous requests. Each virtual user sends its own address in
`X-Forwarded-For` (in 198.18.0.0/15, reserved for benchmarks), as the proxy
does for each administrator in production. Without it, the limits per address
see a single client: the sign-in limit answers `429` once 100 sign-ins are in
flight, and the campaign measures refusals. The ramp holds 50, then 100 sessions for 3 min each,
then 200 sessions for 15 min (`HOLD`, shorter for a trial run).

Thresholds, per action: average under 2,000 ms, 95th percentile under
3,000 ms; under 1 % of failed requests overall. A threshold that fails makes
k6 exit with a non-zero code.

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

# 3. The environment, then the data (after the migrations)
bash load-tests/up.sh variamos-admin:load /tmp/load-keys ../VariaMosAdmin
docker exec -i ev92-pg psql -q -U variamos_admin -d VariamosDB \
  -v password="$PASSWORD" < load-tests/seed.sql

# 4. The campaign (about 26 min), and the resources beside it
mkdir -p load-results && chmod 777 load-results
docker run -d --name ev92-k6 --network ev92-net \
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

## Not covered yet

- Sending a notification to a group: it needs the notification service.
- The external probe and the availability requirement (MA-NF-11).
- A nightly run in CI: it needs a dedicated environment.
