FROM ghcr.io/nuviomedia/nuvio-account-dashboard@sha256:6b6976985906df71bb8603422e7e199d309d60f8114481e959838ce00cb29013
USER root
COPY chronio/dashboard /opt/chronio/dashboard
RUN node /opt/chronio/dashboard/brand.mjs /app
COPY chronio/dashboard/assets/ /app/public/assets/
USER 1000:1000
