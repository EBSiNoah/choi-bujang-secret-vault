# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

/api/notes는 공개 주소이며 현재 로그인 확인이나 호출 제한이 없습니다. 따라서 누구나 직접 호출해 가상 메모 네 건을 읽을 수 있습니다. 서버 전용 Supabase 키는 브라우저로 전달되지 않지만, 공개 함수가 그 키를 사용해 데이터를 반환하므로 함수 자체가 접근 통제를 제공하지는 않습니다. 실제 자료를 사용하지 말고, 인증·인가와 호출 제한을 추가하기 전까지 공개용 가상 자료만 사용하세요


## 산재한 취약점
/api/notes는 공개 주소이며 현재 로그인 확인이나 호출 제한이 없습니다. 누구나 직접 요청해 가상 메모 네 건을 읽을 수 있습니다. SUPABASE_SECRET_KEY는 서버 안에만 있지만, 이 공개 함수가 그 키로 자료를 읽어 응답하므로 함수 자체가 접근 통제를 제공하지는 않습니다. 인증·인가와 호출 제한을 추가하기 전까지 실제 자료를 넣지 마세요


## 가상 메모 문장 노출 확인

다음 확인은 지정한 시점의 최신 GitHub 파일과 현재 배포에서 가상 메모 문장을 찾는 점검입니다. 과거에 공개된 커밋이나 배포까지 검사하거나 삭제하는 절차는 아닙니다.

검색할 문장:

- `실습용 가상 과제 기록`
- `실습용 가상 포트폴리오 기록`
- `실습용 가상 리추얼 기록`
- `실습용 가상 행정 기록`

### GitHub 최신 파일 확인

1. 이 저장소의 기본 브랜치 `main`을 엽니다. 확인할 때 기준이 된 커밋의 전체 SHA와 날짜를 기록합니다.
2. `data.json`, `public/data.json`, `api/notes.js`, `public/index.html`, `scripts/build-public.mjs`를 각각 엽니다.
3. 각 파일에서 위 네 문장을 하나씩 검색합니다. 파일 안에서 찾기(Ctrl+F 또는 Cmd+F)를 사용합니다.
4. 저장소 검색을 추가로 사용할 경우, 현재 기본 브랜치의 파일 내용 검색인지 확인합니다. 검색 결과가 없다는 것만으로 파일 확인을 대신하지 마세요.

### 현재 배포 파일 확인

1. Vercel에서 현재 Production 배포와 연결된 주소를 확인합니다. 주소와 배포 ID 또는 배포의 커밋 SHA, 확인 날짜를 기록합니다.
2. 그 주소의 `/data.json`과 `/api/notes`를 각각 직접 엽니다.
3. 각 응답에서 위 네 문장을 모두 검색합니다. API가 JSON을 반환하면 브라우저의 페이지 내 찾기를 사용하거나 응답을 로컬 텍스트로 확인합니다.
4. 자료실 첫 화면도 열고 페이지에서 네 문장을 검색합니다. 화면에 문장이 보이는지만 확인하지 말고, `/api/notes` 응답도 별도로 확인합니다.
5. 검색 결과와 확인한 URL·경로·날짜를 기록합니다. 실제 키나 비밀값은 화면 캡처, 로그, README에 남기지 않습니다.

### 과거 공개 여부에 관한 주의

현재 `main` 파일이나 현재 Production 배포에서 문장을 찾지 못했더라도, 과거 공개 커밋과 과거 배포에서 노출됐던 사실이 없어지는 것은 아닙니다. 공개된 옛 커밋 또는 접근 가능한 옛 배포가 남아 있는 동안에는 **“과거 노출이 해소됐다”거나 “메모가 완전히 제거됐다”고 쓰지 마세요.** 현재 상태의 점검 결과와 과거 노출의 상태를 구분해 기록하세요.


4단계 기록: 로그인해도 내 자료만 보이게 (API 소유자 검사)
> 위의 "산재한 취약점" 등 `/api/notes`에 로그인 확인이 없다고 적은 문단은 1단계 시작 틀 시점의 기록입니다. 현재 상태는 이 절을 따릅니다. (기록일 2026-10-07)
현재 작동하는 기능
이메일·비밀번호 로그인과 로그아웃이 있습니다. 가입 폼은 없고, 사용자는 Supabase 대시보드에서 직접 만듭니다. (`public/index.html`)
`/api/notes`는 `src/verify-login.mjs`로 토큰을 검사하고, 통과한 요청에만 가상 메모를 돌려줍니다. 실패하면 `401`입니다.
로그인한 사용자는 `/api/memos`로 자기 메모를 추가·조회·수정·삭제합니다. 메모는 `public.memos` 테이블에 저장됩니다.
이번 변경 (4단계)
바뀐 파일은 `api/memos/[id].js` 하나입니다. 한 건 읽기·수정·삭제는 서버가 검증한 사용자 ID와 DB 행의 `owner_id`가 같을 때만 허용합니다.
질의 조건에 `owner_id`를 넣어 본인 행만 일치하게 하고, 돌려받은 행의 `owner_id`도 다시 비교합니다.
남의 메모는 없는 메모와 똑같이 `404`로 답합니다. id가 존재하는지도 드러내지 않습니다.
수정은 `title`, `body`만 보냅니다. 요청 본문에 `owner_id`·`ownerId`·`user_id`·`userId`가 있으면 소유자 변경 시도로 보고 `403`으로 거부합니다.
추가(POST)는 서버가 확인한 사용자 ID를 `owner_id`로 저장합니다. 본문의 `owner_id`는 무시합니다.
URL·본문의 `userId`, `role`, `owner_id`는 믿지 않습니다.
요청	본인 메모	남의 메모	로그인 없음
`GET /api/memos`	본인 메모 배열	목록에 나오지 않음	`401`
`POST /api/memos`	`201 {id}` (소유자는 검증된 사용자)	-	`401`
`GET /api/memos/:id`	`200 {id,title,body}`	`404`	`401`
`PUT /api/memos/:id`	`200 {id,title,body}`	`404` (`owner_id` 포함 시 `403`)	`401`
`DELETE /api/memos/:id`	`204`	`404`	`401`
`aleph.config.json`의 `allowedRoutes`에는 판정기가 허용하는 자료 경로만 적습니다: 공지 목록 `GET /api/notes`, 공지 단건 `GET /api/notes/:id`, 메모 단건 `GET·PUT·DELETE /api/memos/:id`. 개인 메모 전체 목록·생성, 공지 쓰기, 강사 자료와 로그인 경로는 판정기 허용 경로가 아닙니다.
다시 확인하는 방법
A 계정으로 배포 주소에 로그인합니다. 브라우저에서 `F12`를 눌러 Console을 엽니다.
B 계정 소유의 시험 메모 id(`00000000-0000-4000-8000-00000000b001`)로 `GET`·`PUT`·`DELETE`를 보냅니다. 거부되어야 합니다. (`404`)
A 본인 메모 id로 `GET`·`PUT`·`DELETE`를 보내면 정상이어야 합니다. (`200`, `200`, `204`) 본문에 `owner_id`를 넣은 `PUT`은 `403`입니다.
시크릿 창에서 로그인 없이 `/api/memos`를 열면 `401`이어야 합니다.
확인 상태와 남은 일
확인함: 가짜 DB로 A/B 시나리오 13개(본인 접근 유지, 상대 메모 접근 거부, 소유자 변경 거부, 무로그인 거부)를 로컬에서 시험했고 모두 통과했습니다.
미확인: 실제 Supabase·Vercel 배포 환경에서의 시험 결과는 아직 기록하지 않았습니다. 위 "다시 확인하는 방법"을 실행한 뒤 결과를 여기에 적습니다.
남은 일: DB 권한(RLS 등) SQL은 다음 단계에서 다룹니다. `/api/notes`와 `/api/memos`의 호출 제한은 아직 없습니다. 이 기록 당시 `aleph.config.json`의 `step` 값은 6이었습니다.
이 저장소에는 비밀번호·토큰·서버 전용 키를 넣지 않습니다.


작업 기록 (2026-10-08 기준)
> 위의 시작 틀 설명 중 "`/api/notes`에 로그인 확인이 없다"처럼 1단계 상태를 말하는 문단은 시작 시점의 기록입니다. 현재 상태는 이 절을 따릅니다.
현재 구조
브라우저(`public/index.html`) → 서버 함수(`api/*`) → Supabase 순서로만 흐릅니다. 화면은 이 서비스의 `/api/…`에만 요청하고, Supabase 주소와 키는 서버 환경변수에만 둡니다.
Vercel 환경변수 (서버 전용)	쓰임
`SUPABASE_URL`	서버가 Supabase에 요청할 주소
`SUPABASE_SECRET_KEY`	서버가 메모를 읽고 쓰고, 토큰을 검사할 때
`SUPABASE_PUBLISHABLE_KEY`	서버가 로그인(비밀번호 확인)을 요청할 때 (5단계에서 추가)
단계별 작업
로그인 (2~3단계)
이메일·비밀번호 로그인과 로그아웃 화면을 만들었습니다. 가입 폼은 없고, 사용자는 Supabase 대시보드에서 직접 만듭니다.
`/api/notes`는 `src/verify-login.mjs`로 토큰을 검사하고, 통과한 요청에만 가상 메모를 돌려줍니다. 실패하면 `401`입니다.
`aleph.config.json`의 `identityProvider`에 로그인 발급자 정보(발급자·키 목록 주소·대상 이름)를 적었습니다. 비밀 값은 없습니다.
메모 추가·수정·삭제
`public.memos` 테이블을 만들었습니다. (`id`, `owner_id`, `title`, `body`, `created_at`, RLS 켬, `anon`·`authenticated` 권한 회수) → `supabase/migrations/20261007000000_create_memos.sql`
서버 API: `api/memos/index.js`(목록·추가), `api/memos/[id].js`(한 건 조회·수정·삭제), 공용 로그인 확인 `src/memos.mjs`
추가할 때 `owner_id`는 서버가 검증한 사용자 ID로만 저장합니다. 요청 본문의 `owner_id`·`userId`·`role`은 믿지 않습니다.
내 자료만 보이게 (4단계)
한 건 읽기·수정·삭제는 검증된 사용자 ID와 DB 행의 `owner_id`가 같을 때만 허용합니다. 질의 조건에 `owner_id`를 넣고, 돌려받은 행도 다시 비교합니다.
남의 메모는 없는 메모와 똑같이 `404`입니다. 수정 본문에 `owner_id` 류가 들어 있으면 소유자 변경 시도로 보고 `403`입니다.
시험용 데이터 SQL(A 소유 3건, B 시험 메모 1건)을 학습용으로 준비했습니다. B 시험 메모 id는 `00000000-0000-4000-8000-00000000b001`입니다.
자료 요청을 서버 한곳으로 (5단계, 진행 중)
`aleph.config.json`에 `originalApiUrl`(프로젝트 주소 + `/rest/v1/memos`, 쿼리 없는 https 경로)을 적었습니다.
배포된 `/aleph.json`에 이 값이 빠져 있던 것이 원인이어서, `scripts/deployment-identity.mjs`가 `originalApiUrl`과 `allowedRoutes`를 형식 검사 후 `aleph.json`에 기록하도록 고쳤습니다. (시작 틀 파일을 수정한 것이므로 단계 원고의 허용 여부를 확인해야 합니다.)
화면 코드에서 Supabase 공개 키와 `supabase-js`를 모두 걷어냈습니다. 로그인은 새 서버 함수 `api/login.js`가 대신 처리하고, 화면은 받은 접근 토큰을 탭의 `sessionStorage`에 두었다가 요청마다 `Authorization` 헤더로 보냅니다.
API와 허용 경로
API 구현 경로 전체와 판정기 허용 경로는 다릅니다. `allowedRoutes`에는 `GET /api/notes`, `GET /api/notes/:id`, `GET·PUT·DELETE /api/memos/:id`를 적으며, 메모 주인 비교는 제작 3의 API에서 수행합니다.
메서드·경로	동작	로그인 없음
`POST /api/login`	이메일·비밀번호 → `{access_token, expires_in, email}`	-
`GET /api/notes`	`training_notes`의 공용 가상 공지(`owner_id` 없음) `{notes:[{title,content}]}`	`401`
`GET /api/memos`	본인 메모 배열	`401`
`POST /api/memos`	`{id?,title,body}` → `201 {id}`	`401`
`GET /api/memos/:id`	`{id,title,body}`, 남의 메모는 `404`	`401`
`PUT /api/memos/:id`	`{title,body}` → `{id,title,body}`, 남의 메모 `404`, `owner_id` 포함 시 `403`	`401`
`DELETE /api/memos/:id`	`204`, 남의 메모는 `404`	`401`
`POST /api/memos/restore`	시험 계정 B의 지정 메모 한 건을 검증된 사본으로 복원 → `{id,owner_id,contentSha256}`	`401`
`POST /api/policies/restore`	시험 정책 사본 미리보기 및 확인 후 지정 범위 복원	`401`

메모 복원 서비스·경로
- 서비스: `personal-memos-v1`; 경로: `POST /api/memos/restore`.
- B 계정 로그인으로 발급된 `Authorization`과 `X-Resource-ID: personal-memos-v1` 헤더가 필요합니다. 요청 본문은 `{snapshot:{id,owner_id,title,body,contentSha256}}`입니다. 서버는 검증된 로그인 소유자와 사본 `owner_id`, 시험 계정 B의 고정 시험 메모 ID를 대조하고, `contentSha256`이 UTF-8 `JSON.stringify({title,body})`의 SHA-256과 일치하는지 확인합니다.
- 서버가 같은 ID·소유자의 현재 행을 조회한 뒤 그 행의 `title`, `body`만 갱신하고, 반환된 ID·소유자·내용 해시를 다시 검사합니다. 다른 메모는 갱신하지 않으며 감사 이력을 쓰거나 수정하지 않습니다. 사본 내용은 오류 응답이나 로그에 포함하지 않습니다.
- 정상은 `200`과 사본의 ID·소유자·내용 해시입니다. 누락·불일치 사본은 `400`, 해당 소유자의 시험 메모가 없으면 `404`, 서비스 오류나 갱신 결과 검증 실패는 `502`입니다. 이 API는 사본의 발급 출처를 서명으로 증명하지 않고, 로그인한 소유자에게 제한된 시험 복원 및 해시 일치만 확인합니다.
- 로컬 재실행: 저장소 루트 터미널에서 `node --test test/memo-restore.test.mjs` 실행. 가짜 인증·DB로 시험 계정 B의 고정 시험 메모만 복원하고, 다른 메모와 감사 이력이 그대로인지 확인합니다. 실제 계정·DB·배포에서 실행한 결과는 아닙니다.

정책 복원 서비스·경로
- 서비스: `test-policy-restore-v1`; 경로: `POST /api/policies/restore`. 현재 [`aleph.config.json`](./aleph.config.json)의 `restoreRoute`에는 정책 복원 경로와 메모 복원 경로 `POST /api/memos/restore`, 그리고 `POST /api/notes/restore`가 선언돼 있습니다. 메모 복원 경로는 위의 `personal-memos-v1` 기능이며 정책 복원과 별개입니다. `POST /api/notes/restore`는 설정에만 있고 현재 API 구현·시험은 확인되지 않아 사용 가능한 경로로 간주하지 않습니다.
- Supabase의 `test_policy_snapshots`와 `test_policy_state`는 정책 시험 전용 저장소입니다. 스키마는 [`supabase/migrations/20261016000100_create_test_policy_restore.sql`](./supabase/migrations/20261016000100_create_test_policy_restore.sql)에 있고, 서버는 `test_policy_state`의 `singleton` 행만 갱신합니다. 이 테이블은 운영 판정기 정책과 별도이며, 운영 정책을 바꾸지 않습니다. 복구를 사용하려면 관리자가 시험 정책 singleton과 침해 전 사본을 별도 준비해야 합니다. 사본이 없으면 `404`로 중단합니다.
- 사본 서명은 서버 전용 `POLICY_SNAPSHOT_HMAC_KEY` 환경 변수(최소 32 UTF-8 바이트)로 검증합니다. 이 값은 공식 호스팅 환경의 비밀 입력란에 직접 설정하고 코드·Git·요청·로그에 넣지 않습니다. 사본의 서명은 HMAC-SHA256이며, 서명 대상은 canonical JSON의 `{version,createdAt,intrusionAt,policy}`입니다. 시각은 UTC ISO 형식이며 저장 후 밀리초 단위 UTC ISO로 정규화해 서명합니다. 확인 요청 때 저장소에서 사본을 다시 읽고 서명을 다시 검증합니다. 사본 생성·서명 작업은 이 API에 포함되지 않으며, 사전 침해 시점에 신뢰된 관리 절차로 준비되어야 합니다.
- 호출은 인증된 POST, 허용된 `POLICY_RESTORE_OPERATOR_ID` 계정, `X-Resource-ID: test-policy-restore-v1`을 요구합니다. `POLICY_RESTORE_OPERATOR_ID`는 공식 호스팅 설정에 복원 권한이 있는 시험 운영자의 인증 사용자 UUID로 지정합니다. 먼저 `{action:"preview",version,restorePaths}`를 POST하면 사본 버전·변경 경로·전후 차이와 5분 유효 확인 토큰을 반환합니다. 변경 범위와 버전을 검토한 뒤에만 `{action:"confirm",confirmationToken}`을 별도 POST합니다. 확인 단계에서도 사본을 다시 읽고 검증하며, 미리보기 뒤 정책이 변경됐으면 거부합니다. 시험 정책 revision 조건부 갱신으로 동시 변경을 덮어쓰지 않습니다. `services`, `serviceRules`/`service_rules`, `audit`, `auditHistory`/`audit_history`, `auditLog`/`audit_log` 경로는 복원 범위에서 거부하며 다른 시험 정책 필드와 기존 감사 기록은 보존합니다.
- 경로·범위 오류는 `400`, 사본 검증 실패나 미리보기 만료/변경은 `409`, 사본 없음은 `404`, 시험 저장소 장애는 `502`입니다. 로컬 가짜 DB 확인은 `node --test test/policy-restore.test.mjs test/policy-restore-api.test.mjs`로 실행합니다. 실제 Supabase migration 적용, 시험 데이터 준비, 키 설정, 배포 호출은 이 문서 수정 중 실행하지 않았으므로 **미실행**입니다.

확인 상태
확인함 (로컬, 가짜 DB·가짜 인증 서버): 4단계 A/B 시나리오 13개, `deployment-identity.mjs` 검사 8개와 `allowedRoutes` 7개, `api/login.js` 7개가 모두 통과했습니다. 화면 코드에 `sb_publishable`, `eyJ`, `supabase` 문자열이 남아 있지 않은 것도 확인했습니다.
미확인: 실제 Supabase·Vercel 배포 환경에서의 동작, 심판의 5단계 판정(`S05_ORIGINAL_URL_MISSING` 재확인)은 아직 기록하지 않았습니다.
남은 일
Vercel 프로젝트 Settings → Environment Variables에 `SUPABASE_PUBLISHABLE_KEY`를 추가하고 다시 배포합니다. 없으면 로그인이 `500`입니다.
배포 후 `/aleph.json`에 `originalApiUrl`과 `allowedRoutes`가 보이는지 확인하고, 심판을 다시 돌립니다.
`api/notes.js`가 가상 메모를 `memos`에서 읽게 할지 결정합니다. 바꾼다면 `body`를 `content`로 바꿔 내보내고, 검증된 사용자의 행만 읽어야 4단계 보호가 유지됩니다.
DB 권한(RLS) SQL은 다음 요청으로 남아 있습니다. `training_notes`의 RLS 상태 확인이 필요합니다.
`/api/login`, `/api/notes`, `/api/memos`에는 호출 제한이 없습니다.
`aleph.config.json`의 `step`은 현재 7이며, `build-public.mjs`와 `deployment-identity.mjs`는 1~12단계 값을 처리합니다.
알려진 한계: 갱신 토큰을 쓰지 않아 로그인 후 약 1시간이 지나면 다시 로그인해야 하고, 로그아웃은 화면의 토큰만 지웁니다.
다시 확인하는 방법
배포 주소에서 A 계정으로 로그인해 메모를 추가·수정·삭제합니다. 정상이어야 합니다.
시크릿 창에서 `curl -i https://배포주소/api/memos`를 실행합니다. `401`로 거부되어야 합니다.
A로 로그인한 상태에서 `F12` → Console에 아래를 실행합니다. B의 시험 메모는 `404`로 거부되어야 합니다.
```js
   const t = sessionStorage.getItem('vault.token');
   await fetch('/api/memos/00000000-0000-4000-8000-00000000b001', { headers: { Authorization: 'Bearer ' + t } }).then(r => r.status);
   ```
`curl -s https://배포주소/aleph.json`에 `originalApiUrl`과 `allowedRoutes`가 있어야 합니다.
배포된 첫 화면의 소스 보기에서 `supabase`, `sb_`를 검색해 결과가 없어야 합니다.
이 저장소에는 비밀번호·토큰·서버 전용 키를 넣지 않습니다.

## 6단계: 등록한 기기만 자료실에 들어옵니다

별도로 설치할 접속 프로그램은 없습니다. VS Code에서 **Terminal → New Terminal**을 열고 저장소 루트에서 아래 명령을 실행합니다.

```sh
npm run decider:test
```

정상 결과에서 `통과 · 등록 기기의 정상 요청: allow · approved`가 보여야 합니다. 미등록 기기의 가상 요청은 `통과 · 미등록 기기의 가상 요청: deny · device_not_registered`로 표시되어야 합니다. 여기서 `통과`는 판정기가 가상 요청에 기대한 응답을 냈다는 뜻입니다. 이 연습은 실제 기기 등록이나 자료실 접속을 시험하지 않습니다. 미등록 기기 공격 시험과 심판 판정은 심판이 맡습니다.

## 7단계: 평소와 다른 접속은 다시 확인합니다

저장소 루트에서 `npm run fixture:7 && npm run decider:test`를 실행해 가상 사건을 연습합니다. 정상 요청은 `allow`, 평소와 다른 시각·네트워크와 다량 읽기가 겹친 가상 사건은 `step_up`이어야 합니다. 미등록 기기는 계속 `deny`이며, 확인 완료로 표시된 가상 재요청은 `allow`입니다.

현재 엔진 계약에는 같은 로그인으로 다시 인증했는지 증명하는 정보가 없습니다. 실제 자료의 사전 차단과 새 로그인 뒤 재판정은 미구현·미실행이며, 위 명령은 가상 요청 연습이지 실제 접속이나 심판 판정 증거가 아닙니다.

## 복구 뒤 1~9단계 재확인 순서

아래는 복구 후에 실행할 순서와 기대 결과입니다. 이 문서를 갱신하면서 재복구, 배포, 계정 요청, 아래 시험은 실행하지 않았습니다. 따라서 아래 확인 상태는 **미실행**이며, 기대 결과를 실제 결과로 기록하지 마세요. 각 항목을 직접 확인한 뒤 날짜, 대상 배포/커밋, 실제 상태 코드 또는 명령 출력을 별도로 기록합니다. 가상 계정·가상 메모만 사용하고 비밀번호·토큰·메모 본문은 기록하지 않습니다.

### 0. 복구 결과 확인 — 이후 시험의 선행 조건

1. 복원 직전에 침해 전 안전 정책 사본을 저장소에서 다시 읽고 서명·무결성 검증을 수행합니다. 사본이 없거나 검증에 실패하면 현재 정책을 읽거나 복원하지 말고 즉시 중단합니다. 검증 성공 후 복원할 사본의 버전과 변경될 경로·항목 범위를 실행 전에 미리보기로 표시하고, 확인·승인을 받은 경우에만 시험 정책에 적용합니다. 복원 대상으로 고르지 않은 서비스 규칙과 감사 이력은 보존됐는지 대조합니다. 정책 API는 `test_policy_state` 시험 테이블에만 연결되며 운영 판정기 정책을 바꾸지 않습니다. 브라우저 버튼은 없고 API의 미리보기 응답을 확인한 뒤 별도의 확인 요청을 보내야 합니다. Migration, 사전 사본, HMAC 키, 허용 운영자 ID가 준비되지 않았다면 호출하지 말고 중단합니다.
2. 시험 계정 B로 로그인한 상태에서 `personal-memos-v1`의 `POST /api/memos/restore`를 호출합니다. 사본은 지정된 B 시험 메모 ID, 로그인한 B의 `owner_id`, `title`, `body`, `contentSha256`을 포함해야 합니다. 본문 해시는 UTF-8 `JSON.stringify({title,body})`의 SHA-256 값입니다. API가 반환한 ID·소유자·해시가 사본과 모두 같을 때만 복구 대상 한 건의 확인을 기록합니다. 응답이 `400`, `404`, `502`이거나 값이 다르면 멈추고, 다른 계정/메모를 대상으로 재시도하지 않습니다. 이 경로는 사본 발급자의 서명을 확인하지 않으므로, 자체 내용 해시만으로 사본 출처까지 검증됐다고 간주하지 않습니다.
3. 복구가 확인된 후 아래 순서대로 정상 요청과 금지 요청을 각각 실행합니다. 상태 코드는 현재 API 계약이 정한 기대값이며, 실제 배포 응답과 일치한 경우에만 결과를 기록합니다.

| 단계 | 정상 요청 — 기대 | 금지 요청 — 기대 | 확인 방법 / 경계 |
|---|---|---|---|
| 1. 공개 시작 화면 | `/`에서 공개 가능한 가상 화면을 확인 | 복구된 개인 메모·실제 자료가 공개 정적 파일이나 `/data.json`에서 보이면 안 됨 | 화면 및 `/data.json`을 열어 확인합니다. 시작 시점의 공개 가상 자료 동작을 재현하려고 실제 자료를 공개하지 않습니다. |
| 2. 정적 자료 분리 | 로그인 후 서버 경로에서 권한이 있는 가상 자료를 확인 | 비로그인 `/api/notes` 요청은 `401`; 공개 `/data.json`에는 개인 메모가 없어야 함 | 비로그인 브라우저/시크릿 창에서 확인합니다. 현재 `public/data.json` 빌드 복사는 꺼져 있으므로 공개 데이터가 있다고 가정하지 않습니다. |
| 3. 로그인 | 시험 계정으로 화면에서 로그인하고 자료실 진입 | 로그아웃/시크릿 창에서 보호 API는 `401`; 틀린 인증 정보는 로그인 실패 | [public/index.html](./public/index.html)의 로그인 화면을 사용합니다. 비밀번호나 토큰을 문서·로그·화면 캡처에 남기지 않습니다. |
| 4. 소유자 검사 | A는 A 메모를, B는 복구된 B 메모를 조회 (`200`) | A가 B 메모를 조회·수정·삭제하면 `404`; 수정 본문에 소유자 필드를 넣으면 `403` | A/B 각각 로그인해 시험합니다. 복구 대상 B 메모는 수정·삭제하지 말고, 변경 시험은 별도 가상 메모를 사용합니다. |
| 5. 서버 API 경유 | 로그인한 사용자 요청이 `/api/notes` 또는 `/api/memos`에서 허가 범위로 처리 | 로그인 없는 API 접근은 `401`; 브라우저가 Supabase 직접 주소/비밀 키로 접근하지 않아야 함 | 브라우저 Network 패널에서 호출 경로를 확인합니다. `aleph.json`의 `originalApiUrl`·`allowedRoutes`도 기록합니다. 실제 DB의 `training_notes` RLS 상태와 직접 우회 거부는 별도 확인 전까지 미실행입니다. |
| 6. 등록 기기 정책 | 등록 기기의 정상 가상 요청은 `allow` | 미등록 기기 가상 요청은 `deny` / `device_not_registered` | `npm run decider:test`. 로컬 연습이며 실제 기기 등록·운영 접속 확인이 아닙니다. |
| 7. 추가 확인 정책 | 정상 요청은 `allow`; 확인 완료된 가상 재요청은 `allow` | 계약에 맞는 복합 이상 접속은 `step_up` | `npm run fixture:7 && npm run decider:test`. 실제 재로그인 연계와 실제 자료 사전 차단은 미구현·미실행입니다. |
| 8. 해당 단계 정책 | 단계 원고와 운영 계약이 지정한 정상 요청 | 같은 계약이 지정한 금지 요청 | 이 저장소 문서에서 8단계의 요청·응답 계약을 확인할 수 없습니다. 임의의 정상/금지 사례나 통과 결과를 만들지 말고, 단계 원고와 심판 계약을 확보할 때까지 미실행으로 둡니다. |
| 9. 조회 폭주 탐지 | 같은 사용자의 정상 조회 30건 또는 10분 안의 120건 이하는 `observe` | 10분 안에 같은 사용자의 GET 121건 이상은 `propose_revocation` | `npm run detect:test`. 가상 사건 연습일 뿐 운영 엔진 사건 연결, 실제 접속 회수, 심판 판정은 확인하지 않습니다. |

### 시험 실행 및 기록

- 로컬 재현 명령은 필요한 경우 각각 실행합니다: `node --test test/memo-restore.test.mjs`, `node --test test/policy-restore.test.mjs test/resource-authorization.test.mjs`, `npm run decider:test`, `npm run fixture:7 && npm run decider:test`, `npm run detect:test`. 서로 다른 명령은 각각의 출력과 종료 코드를 기록합니다. 이 명령을 아직 실행하지 않았다면 결과는 **미실행**입니다.
- 로컬 테스트는 가짜 인증/DB 또는 가상 요청 연습입니다. 실제 배포 확인을 대신하지 않습니다. 배포 검증은 복구 대상 시험 계정으로 위 표의 정상·금지 요청을 모두 별도 실행하고, 실제 HTTP 상태·정책 버전·날짜를 기록해야 합니다.
- 기록 양식: `단계 | 실행일 | 배포 커밋 | 정상 요청 결과 | 금지 요청 결과 | 근거 | 상태(통과/실패/미실행)`. 응답 본문, 개인 자료, 인증 정보는 근거에 복사하지 않습니다. 실행 전 상태는 모두 **미실행**으로 유지합니다.