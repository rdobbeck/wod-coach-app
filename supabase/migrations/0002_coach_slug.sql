-- Coach links (<slug>.wod.coach). Additive only; safe to re-run.
alter table "CoachProfile" add column if not exists "slug" text;
alter table "CoachProfile" add column if not exists "brandName" text;
create unique index if not exists "CoachProfile_slug_key" on "CoachProfile"("slug");
