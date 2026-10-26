-- Stage 10: private backup copy for one virtual public training notice.
-- The browser cannot read this table; restore runs through the authenticated server API.

create or replace function public.training_note_content_sha256(t text, c text)
returns text
language sql
immutable
as $$
  select encode(
    sha256(convert_to(octet_length(convert_to(t, 'UTF8'))::text || ':' || t || c, 'UTF8')),
    'hex'
  )
$$;
revoke all on function public.training_note_content_sha256(text, text)
  from public, anon, authenticated;
grant execute on function public.training_note_content_sha256(text, text)
  to service_role;

create table if not exists public.training_note_backups (
  note_id uuid primary key,
  title text not null,
  content text not null,
  content_sha256 text not null,
  backed_up_at timestamptz not null default now()
);

alter table public.training_note_backups enable row level security;
revoke all on public.training_note_backups from public, anon, authenticated;
grant select on public.training_note_backups to service_role;

-- Create a backup deliberately after checking the selected virtual notice.
-- This example is intentionally not executed by the migration:
-- insert into public.training_note_backups (note_id, title, content, content_sha256)
-- select id, title, content, public.training_note_content_sha256(title, content)
-- from public.training_notes
-- where id = '00000000-0000-4000-8000-000000000001' and owner_id is null;
