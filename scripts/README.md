# scripts/

## sync-coachrx.ts

Daily sync from CoachRx exercise library → Supabase. Two storage layers:

- `coachrx_exercises` (raw mirror): verbatim CoachRx data, refreshed every run.
- `ExerciseLibrary` (app table): your app's source of truth, seeded from the mirror via `sync_coachrx_to_exercises()`. Rows with `locked = true` are protected from overwrites so your manual curation survives every sync.

### One-time setup

1. **Apply the Prisma migration** (adds `coachrx_id`, `locked`, `last_synced_at` to `ExerciseLibrary`):
   ```bash
   yarn prisma migrate deploy
   ```

2. **Run the Supabase setup SQL** in your project's SQL editor (or via `supabase db push`):
   ```
   supabase/migrations/0001_coachrx_mirror.sql
   ```

3. **Fill in `.env.local`** (copy from `.env.example`):
   - `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING` — Supabase Postgres URLs
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — from Project Settings → API
   - `OPENTABS_BASE_URL` defaults to `http://127.0.0.1:9515` (leave alone)
   - `OPENTABS_AUTH_TOKEN` auto-loads from `~/.opentabs/config.json` if unset

4. **Confirm the OpenTabs Chrome profile is logged into CoachRx** at `https://dashboard.coachrx.app/library/exercises`.

### Run once

```bash
yarn sync:coachrx
```

Expected output ends with a single summary line:

```
[sync] ok: 1396 seen, 1396 upserted (1396 inserted, 0 updated, 0 locked-skipped), 0 deleted
```

Failures write a `coachrx_sync_log` row with `status = 'error'` and exit non-zero — they will not pretend to succeed.

### Schedule daily at 4 AM

```bash
cp scripts/org.dobbeck.coachrx-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/org.dobbeck.coachrx-sync.plist
```

Logs go to `logs/coachrx-sync.log` and `logs/coachrx-sync.err`. To force an immediate run:

```bash
launchctl start org.dobbeck.coachrx-sync
```

To unschedule:

```bash
launchctl unload ~/Library/LaunchAgents/org.dobbeck.coachrx-sync.plist
```

### Protecting manual edits

Set `locked = true` on any `ExerciseLibrary` row to prevent the next sync from overwriting your changes:

```sql
update "ExerciseLibrary"
set locked = true,
    name = 'My better name',
    instructions = 'My cleaned-up cues...'
where coachrx_id = '<id>';
```

The next sync will count it under `skipped_locked` and leave it alone.

### Architecture

```
CoachRx (browser session in OpenTabs profile)
  │
  │  GET /api/v1/exercises (one-shot JSON, ~100KB)
  ▼
sync-coachrx.ts
  │
  ▼
coachrx_exercises (raw mirror, lossless)
  │
  │  sync_coachrx_to_exercises()
  ▼
ExerciseLibrary (app table — yours to curate)
```

No CoachRx credentials are stored. The script observes a request that your authenticated browser is already making.
