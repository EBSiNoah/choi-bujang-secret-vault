-- 로그인한 사용자가 쓰는 가상 메모. 브라우저는 이 테이블에 직접 접근하지 않고
-- 서버 API(/api/memos)만 서버 전용 키로 읽고 씁니다.
create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists memos_owner_id_idx on public.memos (owner_id);

alter table public.memos enable row level security;
revoke all on public.memos from anon, authenticated;
