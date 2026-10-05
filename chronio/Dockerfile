FROM docker.io/library/busybox:1.37@sha256:bdf57e528e45e4433820e045b29b4597825a1c9e38353532d90a01445013f82e
COPY database /opt/chronio/database
COPY volumes /opt/chronio/volumes
COPY assets /opt/chronio/assets
COPY chronio /opt/chronio/chronio
USER 1000:1000
