# Chronio extensions

`sync_pull_playlist_configuration(p_profile_id)` returns zero rows for a profile
without configuration, or one row with `configuration`, `revision`, `updated_at`.
An empty configuration is a real saved value, distinct from no row or an error.

`sync_push_playlist_configuration(p_profile_id, p_configuration, p_expected_revision)`
creates at revision 0 or replaces the matching revision. It returns the saved
row. A stale write returns HTTP 409 (PostgREST code `PT409`); reload and merge before retrying.
Only authenticated accounts can invoke these APIs; the owner is resolved on the
server. Profile deletion and account deletion cascade to the configuration.

```json
{"version":1,"sources":["https://publisher.example/v1/index.json"],"disabledPlaylists":[{"sourceUrl":"https://publisher.example/v1/index.json","id":"star-trek"}]}
```

Sources are ordered, unique HTTP(S) index URLs. Disabled identities use the
unchanged source URL plus playlist id. No source is added by default. The record
is shared across platforms and contains neither cached playlist content nor
playback places/title progress. Writers should preserve unknown v1 fields;
unsupported versions must be left untouched. URLs are stored, never fetched by
this backend. Limits: 100 sources, 2,000 disabled selections, 256 KiB per record.

New accounts receive a primary profile immediately, which they can rename
through the account dashboard or client. Existing profiles are left intact.

The `/playlists` browser editor uses email/password sign-in and the public
client key returned by discovery. Session tokens stay in memory and disappear
on reload or sign-out. It saves with the loaded revision, rejecting stale edits.
Use the account dashboard to register accounts and manage existing addon data.
Email is automatically confirmed until SMTP is configured, matching upstream.

## Kubernetes

`kubernetes/` supplies the database, auth, REST API, gateway, edge functions,
Storage, image proxy and dashboard. Compose and its launcher remain available
for upstream compatibility. Kubernetes uses direct database connections and
omits optional Studio, Realtime and the external connection pooler.

The namespace must contain `chronio-env` and `ghcr-pull` Secrets. Environment
keys are qualified as `<service>__<variable>`; containers reference only their
own keys. Server credentials must never appear in public discovery or frontend
configuration. Homelab generates and SOPS-encrypts this Secret and pins the
`chronio-payload` image to a built digest.

Fresh database initialization keeps Supabase's built-in initialization files
and adds Nuvio's bootstrap schema. A migration Job applies remaining migrations
under a session advisory lock. The seed Job uploads built-in avatars through
Storage. Wait for the migration Job before testing app connections; gateway
health alone does not establish schema readiness. On upgrades, replace completed
Jobs (Flux force recreation) so the revision's migration and seeding run again.

PostgreSQL data, its extension configuration and Storage have separate PVCs.
Back up all three before updates; retain the JWT/auth secrets with the backup.
A restore must be tested on isolated PVCs. The database image's standard
entrypoint manages the PostgreSQL user. Other application processes run with
explicit non-root users. One-time storage/config initialization containers have
only the file capabilities needed to prepare mounted directories.

Connect Chronio TV's full build to the HTTPS origin using its custom-server UI.
The origin publishes `/.well-known/nuvio` with `service: nuvio`, so unmodified
Nuvio discovery remains compatible. A Chronio TV build containing playlist sync
is required for the new configuration API; older builds still connect and sync
addons, but keep their playlists local.
