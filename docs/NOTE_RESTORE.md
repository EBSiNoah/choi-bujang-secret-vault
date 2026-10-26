# 가상 공지(notes) 한 건 복원

이 기능은 `public.training_notes`의 지정된 가상 공지 한 건만 비공개 `public.training_note_backups` 사본에서 복원합니다. 기존 메모 복원과 별도 경로·테이블·해시를 사용합니다.

- 미리보기/복원 경로: `POST /api/notes/:id/restore`
- 리소스 헤더: `x-resource-id: instructor-announcements-v1`
- 인증: 로그인된 계정이어야 하며 `public.instructors`의 강사여야 합니다.
- 대상: `src/note-restore-target.mjs`에 지정된 하나의 공지 ID만 허용합니다.
- 정책 판정 경로: `aleph.config.json`의 `allowedRoutes`에만 등록합니다. `restoreRoute`는 시험 정책 복원용 `/api/policies/restore`만 유지합니다.

## 사본 준비

마이그레이션 `supabase/migrations/20261018000000_create_training_note_backups.sql`을 검토하고, Supabase에서 적용해야 합니다. 이 마이그레이션은 비공개 사본 테이블과 SHA-256 함수를 만들지만, 사본 행은 자동으로 만들지 않습니다.

대상 ID와 원본 행을 먼저 확인한 다음 SQL Editor에서 의도한 가상 공지 한 건만 백업합니다. 다음 예시는 지정된 가상 ID에 한해 실행합니다.

```sql
insert into public.training_note_backups (note_id, title, content, content_sha256)
select id, title, content,
       public.training_note_content_sha256(title, content)
from public.training_notes
where id = '00000000-0000-4000-8000-000000000001'
  and owner_id is null
on conflict (note_id) do nothing;
```

이미 해당 ID의 사본이 있다면 덮어쓰지 않습니다. 기존 사본의 생성 시점과 목적을 확인하기 전에는 업데이트하지 마세요. 사본이 없으면 API는 `BACKUP_NOT_FOUND`로 중단합니다.

## 읽기 전용 dryRun

배포된 API에 강사 계정의 access token으로 요청합니다. 비밀 토큰을 저장소나 문서에 적지 마세요.

```http
POST https://<배포 도메인>/api/notes/00000000-0000-4000-8000-000000000001/restore
x-resource-id: instructor-announcements-v1
Authorization: Bearer <강사 access token>
Content-Type: application/json

{"dryRun":true}
```

성공 응답에서 `restoreVersion.id`, `restoreVersion.contentSha256`, `scope` 및 `current.contentSha256`을 확인합니다. 이 모드는 `PATCH`나 `POST` 쓰기를 하지 않습니다. 응답의 ID와 범위가 의도와 다르거나 사본이 없거나 해시 검증에 실패하면 중단합니다. 확인한 결과를 README에 기록할 때까지 README는 변경하지 않습니다.

## 실제 쓰기

실제 요청은 `dryRun` 결과를 검토하고 별도로 명시적으로 결정했을 때만 진행합니다. 확인한 해시를 `confirmContentSha256`로 그대로 보내야 합니다. 서버는 호출 시점에도 비공개 백업을 다시 읽고 해시를 다시 계산합니다. 백업 해시 불일치 또는 확인 해시 불일치면 중단하며, 지정된 공지 한 건만 조건부 갱신하거나 원본이 없을 때만 삽입합니다. 다른 공지는 건드리지 않고, 감사 이벤트는 메모 내용 없이 런타임 로그에 추가합니다.

복원 API를 올바르게 배포하려면 마이그레이션을 적용하고, 대상 사본을 확인한 다음, 코드·설정이 포함된 배포를 만들어야 합니다. 이 저장소에서 DB 마이그레이션 적용, 백업 행 생성, 실제 dryRun, 실제 복원 또는 배포는 수행하지 않았습니다.

## 테스트

로컬 모의 테스트 명령:

```sh
npm run test:note-restore
```

모의 테스트 통과는 실제 Supabase 데이터나 배포 API를 검증한 결과가 아닙니다.
