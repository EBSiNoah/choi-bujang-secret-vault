create table if not exists public.test_policy_snapshots (
  version text primary key,
  created_at timestamptz not null,
  intrusion_at timestamptz not null,
  policy jsonb not null check (jsonb_typeof(policy) = 'object'),
  signature text not null check (signature ~ '^[a-f0-9]{64}$')
);

create table if not exists public.test_policy_state (
  id text primary key check (id = 'singleton'),
  policy jsonb not null check (jsonb_typeof(policy) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.test_policy_snapshots enable row level security;
alter table public.test_policy_state enable row level security;

revoke all privileges on table public.test_policy_snapshots
  from public, anon, authenticated;
revoke all privileges on table public.test_policy_state
  from public, anon, authenticated;

grant select, insert on table public.test_policy_snapshots to service_role;
grant select, insert, update on table public.test_policy_state to service_role;
