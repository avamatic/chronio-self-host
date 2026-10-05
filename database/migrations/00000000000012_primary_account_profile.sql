BEGIN;

-- A newly registered household can use the playlist editor and TV immediately.
CREATE FUNCTION public.chronio_create_primary_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles(user_id, profile_index, name)
    VALUES (new.id, 1, 'Profile 1')
    ON CONFLICT (user_id, profile_index) DO NOTHING;
    RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION public.chronio_create_primary_profile() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created_chronio_profile
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.chronio_create_primary_profile();
INSERT INTO public.profiles(user_id, profile_index, name)
SELECT id, 1, 'Profile 1' FROM auth.users
ON CONFLICT (user_id, profile_index) DO NOTHING;
INSERT INTO nuvio_migrations.schema_migrations(version) VALUES ('00000000000012');
COMMIT;
