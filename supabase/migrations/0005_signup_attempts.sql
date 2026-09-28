-- Signup rate limit (lib/signup-guard.ts). Additive only.
create table if not exists "SignupAttempt" (
  "id" text primary key,
  "ipHash" text not null,
  "createdAt" timestamp(3) not null default current_timestamp
);
create index if not exists "SignupAttempt_ipHash_createdAt_idx" on "SignupAttempt" ("ipHash", "createdAt");
