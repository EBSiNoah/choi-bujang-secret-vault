-- 10단계: 비공개 가상 메모 사본. 브라우저는 접근하지 못하고,
-- 서버 API(/api/memos/:id/restore)만 서버 전용 키로 읽습니다.
-- memos 와 외래키로 묶지 않습니다: 원본이 지워져도 사본은 남아야 합니다.

-- 앱의 contentHash(title, body) 와 같은 값을 만듭니다. (바이트 길이 + ':' + 제목 + 본문의 SHA-256)
create or replace function public.memo_content_sha256(t text, b text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(octet_length(convert_to(t, 'UTF8'))::text || ':' || t || b, 'UTF8')), 'hex')
$$;
revoke all on function public.memo_content_sha256(text, text) from public, anon, authenticated;

create table if not exists public.memo_backups (
  memo_id uuid primary key,
  owner_id uuid not null,
  title text not null,
  body text not null default '',
  content_sha256 text not null,
  backed_up_at timestamptz not null default now()
);

create index if not exists memo_backups_owner_id_idx on public.memo_backups (owner_id);

alter table public.memo_backups enable row level security;
revoke all on public.memo_backups from anon, authenticated;

-- 사본 만들기 예시 (시험 계정 B의 가상 메모 한 건. <메모 ID>를 채워 직접 실행):
-- insert into public.memo_backups (memo_id, owner_id, title, body, content_sha256)
-- select id, owner_id, title, body, public.memo_content_sha256(title, body)
-- from public.memos where id = '<메모 ID>';
