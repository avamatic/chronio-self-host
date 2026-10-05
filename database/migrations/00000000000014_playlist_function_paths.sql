BEGIN;
-- Use the same fixed search path as the hardened upstream RPCs.
ALTER FUNCTION public.sync_pull_playlist_configuration(integer)
SET search_path = pg_catalog, public, auth, extensions, pg_temp;
ALTER FUNCTION public.sync_push_playlist_configuration(integer, jsonb, bigint)
SET search_path = pg_catalog, public, auth, extensions, pg_temp;
ALTER FUNCTION public.chronio_create_primary_profile()
SET search_path = pg_catalog, public, auth, extensions, pg_temp;
INSERT INTO nuvio_migrations.schema_migrations(version) VALUES ('00000000000014');
COMMIT;
