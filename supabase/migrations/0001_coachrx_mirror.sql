-- Run this in the Supabase SQL editor (or via supabase CLI) once,
-- BEFORE the first `yarn sync:coachrx` run.
--
-- It creates the raw mirror table that the sync script writes to,
-- the run log, and the function that propagates rows from the
-- raw mirror into the app's "ExerciseLibrary" table.
--
-- Prereq: the Prisma migration in prisma/migrations/20260507000000_coachrx_link
-- has already been applied (so "ExerciseLibrary" has coachrx_id, locked,
-- last_synced_at columns).

-- ---------------------------------------------------------------------------
-- Layer 2: raw mirror — verbatim CoachRx /api/v1/exercises payload
-- ---------------------------------------------------------------------------
create table if not exists coachrx_exercises (
  id text primary key,
  name text not null,
  description text,
  url text,
  patterns text[] not null default '{}',
  equipment text[] not null default '{}',
  is_default boolean not null default false,
  owner_id text,
  thumbnail_url text,
  raw_json jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists coachrx_exercises_name_idx
  on coachrx_exercises (lower(name));
create index if not exists coachrx_exercises_default_idx
  on coachrx_exercises (is_default);

-- ---------------------------------------------------------------------------
-- Sync run log
-- ---------------------------------------------------------------------------
create table if not exists coachrx_sync_log (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,                    -- 'ok' | 'error' | 'partial'
  rows_seen int,
  rows_upserted int,
  rows_deleted int,
  rows_inserted_app int,
  rows_updated_app int,
  rows_skipped_locked int,
  error text
);

-- ---------------------------------------------------------------------------
-- Mapper: raw mirror -> ExerciseLibrary
--
-- Inserts new rows for any coachrx_exercises entry not yet in
-- ExerciseLibrary, and updates existing rows whose `locked = false`.
-- Locked rows are left untouched so manual curation survives.
--
-- Field mapping:
--   coachrx_exercises.id          -> ExerciseLibrary.coachrx_id
--   .name                         -> .name
--   .url                          -> .videoUrl
--   .description                  -> .instructions
--   .equipment                    -> .equipment
--   .patterns                     -> .muscleGroups
--   .thumbnail_url                -> .thumbnailUrl
--   NOT .is_default               -> .isCustom (true = coach-uploaded)
--
-- ExerciseLibrary.category and .difficulty are required (NOT NULL) but
-- have no CoachRx equivalent. We seed them with literal placeholders.
-- Manual curation can replace these later (set locked=true to preserve).
-- ---------------------------------------------------------------------------
create or replace function sync_coachrx_to_exercises()
returns table (
  inserted int,
  updated int,
  skipped_locked int
) as $$
declare
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
begin
  -- Insert new rows
  with new_rows as (
    insert into "ExerciseLibrary" (
      id, "coachrx_id", name, "videoUrl", instructions,
      equipment, "muscleGroups", "thumbnailUrl",
      "isCustom", category, difficulty,
      "last_synced_at", "createdAt", "updatedAt"
    )
    select
      gen_random_uuid()::text,
      c.id,
      c.name,
      c.url,
      c.description,
      c.equipment,
      c.patterns,
      c.thumbnail_url,
      not c.is_default,
      'Uncategorized',
      'Unknown',
      now(),
      now(),
      now()
    from coachrx_exercises c
    left join "ExerciseLibrary" e on e."coachrx_id" = c.id
    where e.id is null
    returning 1
  )
  select count(*) into v_inserted from new_rows;

  -- Update existing unlocked rows
  with updated_rows as (
    update "ExerciseLibrary" e
    set name = c.name,
        "videoUrl" = c.url,
        instructions = c.description,
        equipment = c.equipment,
        "muscleGroups" = c.patterns,
        "thumbnailUrl" = c.thumbnail_url,
        "isCustom" = not c.is_default,
        "last_synced_at" = now(),
        "updatedAt" = now()
    from coachrx_exercises c
    where e."coachrx_id" = c.id
      and e.locked = false
    returning e.id
  )
  select count(*) into v_updated from updated_rows;

  -- Count rows we deliberately skipped because they were locked
  select count(*)::int into v_skipped
  from "ExerciseLibrary" e
  join coachrx_exercises c on c.id = e."coachrx_id"
  where e.locked = true;

  return query select v_inserted, v_updated, v_skipped;
end;
$$ language plpgsql;
