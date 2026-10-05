BEGIN;

-- Shared across TV, desktop and browser; no playlist contents or title progress.
CREATE TABLE public.playlist_configurations (
    user_id uuid NOT NULL,
    profile_id integer NOT NULL CHECK (profile_id BETWEEN 1 AND 6),
    configuration jsonb NOT NULL,
    revision bigint NOT NULL CHECK (revision > 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, profile_id),
    FOREIGN KEY (user_id, profile_id) REFERENCES public.profiles(user_id, profile_index) ON DELETE CASCADE
);
ALTER TABLE public.playlist_configurations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.playlist_configurations FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.sync_pull_playlist_configuration(p_profile_id integer)
RETURNS TABLE(configuration jsonb, revision bigint, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
    SELECT c.configuration, c.revision, c.updated_at
    FROM public.playlist_configurations c
    WHERE c.user_id = public.get_sync_owner() AND c.profile_id = p_profile_id;
$$;

CREATE FUNCTION public.sync_push_playlist_configuration(
    p_profile_id integer,
    p_configuration jsonb,
    p_expected_revision bigint
)
RETURNS TABLE(configuration jsonb, revision bigint, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
    owner_id uuid := public.get_sync_owner();
    item jsonb;
BEGIN
    IF p_profile_id IS NULL OR p_profile_id NOT BETWEEN 1 AND 6
       OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
        RAISE EXCEPTION 'Invalid profile or revision' USING ERRCODE = '22023';
    END IF;
    IF p_configuration IS NULL OR jsonb_typeof(p_configuration) IS DISTINCT FROM 'object'
       OR p_configuration->'version' IS DISTINCT FROM '1'::jsonb
       OR jsonb_typeof(p_configuration->'sources') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_configuration->'disabledPlaylists') IS DISTINCT FROM 'array'
       OR octet_length(p_configuration::text) > 262144 THEN
        RAISE EXCEPTION 'Invalid playlist configuration v1' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_configuration->'sources') > 100
       OR jsonb_array_length(p_configuration->'disabledPlaylists') > 2000 THEN
        RAISE EXCEPTION 'Too many playlist sources or selections' USING ERRCODE = '22023';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_configuration->'sources') LOOP
        IF jsonb_typeof(item) IS DISTINCT FROM 'string'
           OR length(item #>> '{}') > 4096 OR (item #>> '{}') !~ '^https?://[^[:space:]]+$' THEN
            RAISE EXCEPTION 'Invalid playlist source URL' USING ERRCODE = '22023';
        END IF;
    END LOOP;
    IF (SELECT count(*) FROM jsonb_array_elements(p_configuration->'sources')) <>
       (SELECT count(DISTINCT value) FROM jsonb_array_elements(p_configuration->'sources')) THEN
        RAISE EXCEPTION 'Duplicate playlist source' USING ERRCODE = '22023';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_configuration->'disabledPlaylists') LOOP
        IF jsonb_typeof(item) IS DISTINCT FROM 'object'
           OR jsonb_typeof(item->'sourceUrl') IS DISTINCT FROM 'string'
           OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string'
           OR length(item->>'id') NOT BETWEEN 1 AND 1024
           OR NOT (p_configuration->'sources' @> jsonb_build_array(item->>'sourceUrl')) THEN
            RAISE EXCEPTION 'Invalid disabled playlist identity' USING ERRCODE = '22023';
        END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = owner_id AND profile_index = p_profile_id) THEN
        RAISE EXCEPTION 'Profile not found' USING ERRCODE = '22023';
    END IF;
    IF p_expected_revision = 0 THEN
        INSERT INTO public.playlist_configurations(user_id, profile_id, configuration, revision)
        VALUES (owner_id, p_profile_id, p_configuration, 1)
        ON CONFLICT DO NOTHING;
    ELSE
        UPDATE public.playlist_configurations c
        SET configuration = p_configuration, revision = c.revision + 1, updated_at = now()
        WHERE c.user_id = owner_id AND c.profile_id = p_profile_id AND c.revision = p_expected_revision;
    END IF;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Playlist configuration changed; reload before saving' USING ERRCODE = '40001';
    END IF;
    RETURN QUERY SELECT c.configuration, c.revision, c.updated_at
    FROM public.playlist_configurations c WHERE c.user_id = owner_id AND c.profile_id = p_profile_id;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_pull_playlist_configuration(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_push_playlist_configuration(integer, jsonb, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_pull_playlist_configuration(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_push_playlist_configuration(integer, jsonb, bigint) TO authenticated;
NOTIFY pgrst, 'reload schema';
INSERT INTO nuvio_migrations.schema_migrations(version) VALUES ('00000000000011');
COMMIT;
