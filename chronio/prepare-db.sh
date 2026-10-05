#!/bin/sh
set -eu
mkdir -p /init/init-scripts /init/migrations
cp /opt/chronio/volumes/db/roles.sql /init/init-scripts/99-roles.sql
cp /opt/chronio/volumes/db/jwt.sql /init/init-scripts/99-jwt.sql
cp /opt/chronio/database/migrations/00000000000000_baseline.sql /init/migrations/99999999990000-nuvio-baseline.sql
cp /opt/chronio/database/migrations/00000000000001_auth_trigger.sql /init/migrations/99999999990001-nuvio-auth-trigger.sql
