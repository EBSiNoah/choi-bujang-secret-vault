create table if not exists public.instructors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.instructors enable row level security;
revoke all privileges on table public.instructors
  from public, anon, authenticated;
grant select on table public.instructors to service_role;
