begin;

create table public.training_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.training_notes enable row level security;

revoke all privileges on table public.training_notes
  from public, anon, authenticated;

insert into public.training_notes (id, owner_id, title, content)
values
  ('00000000-0000-4000-8000-000000000001', null, '과제', '실습용 가상 과제 기록'),
  ('00000000-0000-4000-8000-000000000002', null, '포트폴리오', '실습용 가상 포트폴리오 기록'),
  ('00000000-0000-4000-8000-000000000003', null, '아침 리추얼', '실습용 가상 리추얼 기록'),
  ('00000000-0000-4000-8000-000000000004', null, '훈련 행정 자료', '실습용 가상 행정 기록')
on conflict (id) do nothing;

commit;
