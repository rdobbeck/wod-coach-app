-- Coach plans, AI balance, Stripe Connect. Additive only; safe to re-run.
alter type "SubscriptionTier" add value if not exists 'COACH';
alter type "SubscriptionTier" add value if not exists 'PRO';
alter type "SubscriptionTier" add value if not exists 'STUDIO';
alter type "SubscriptionStatus" add value if not exists 'TRIALING';

alter table "Subscription" add column if not exists "interval" text;
alter table "Subscription" add column if not exists "currentPeriodEnd" timestamp(3);
alter table "Subscription" add column if not exists "cancelAtPeriodEnd" boolean not null default false;
alter table "Subscription" add column if not exists "setupPaid" boolean not null default false;

alter table "CoachProfile" add column if not exists "aiBalanceCents" integer not null default 0;
alter table "CoachProfile" add column if not exists "aiAutoTopUp" boolean not null default false;
alter table "CoachProfile" add column if not exists "stripeConnectAccountId" text;
alter table "CoachProfile" add column if not exists "connectChargesEnabled" boolean not null default false;
create unique index if not exists "CoachProfile_stripeConnectAccountId_key" on "CoachProfile"("stripeConnectAccountId");
