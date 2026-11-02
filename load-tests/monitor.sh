#!/usr/bin/env bash
# Every 5 s: CPU and memory of the admin and database containers, and the
# connections the admin holds on PostgreSQL (pool of 20), until k6 stops
OUT=$1
echo "time,admin_cpu,admin_mem,pg_cpu,pg_mem,conn_active,conn_idle,conn_total" > $OUT
while docker ps -q --filter name=ev92-k6 | grep -q .; do
  t=$(date +%s)
  s=$(docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' ev92-admin ev92-pg | awk '{print $2","$3}' | paste -sd,)
  c=$(docker exec ev92-pg psql -U variamos_admin -d VariamosDB -Atc "select count(*) filter (where state='active'), count(*) filter (where state like 'idle%'), count(*) from pg_stat_activity where datname='VariamosDB' and pid<>pg_backend_pid()" | tr '|' ',')
  echo "$t,$s,$c" >> $OUT
  sleep 5
done
