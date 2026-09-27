-- Per-coach calendar feed for Sessions. Additive only.
alter table "CoachProfile" add column if not exists "calendarIcsUrl" text;
alter table "CoachProfile" add column if not exists "calendarTz" text;
