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

## 10단계: 백업에서 자료실을 되살립니다
복원 대상 (가상 자료, 한 건)
항목	값
확인 계정	시험 계정 B
복원 대상 메모 ID	`미기록 — dryRun 응답 필요 (현재 src/restore-target.mjs의 대상 ID가 null이라 복원 API는 503)`
소유자(시험 계정 B) ID	`미기록 — dryRun 응답 필요 (현재 src/restore-target.mjs의 소유자 ID가 null이라 복원 API는 503)`
사본의 내용 해시 (SHA-256)	`미기록 — B의 dryRun 응답에서 contentSha256 확인 후 기록 (현재 복원 대상 미설정)`
서비스	`memos`
메모 한 건 복원 경로	`POST /api/memos/:id/restore`
안전 정책 사본 버전 해시	`⟨snapshot --yes 출력의 버전 해시를 채우세요⟩`
시험 정책 복원 경로 (`aleph.config.json`의 `restoreRoute`)	`POST /api/policies/restore` — `test_policy_state`의 시험 정책만 복원합니다. 메모 한 건 복원과 별개입니다.
메모 사본	비공개 테이블 `public.memo_backups` (브라우저 접근 불가, 서버 전용 키로만 읽음)
위 메모 ID 두 개는 `src/restore-target.mjs`의 값과 같아야 합니다. 현재 값이 `null`이므로 메모 복원 경로는 `503 RESTORE_NOT_CONFIGURED`로 닫혀 있습니다. dryRun 값이 실제로 확인되기 전까지 ID·해시를 임의로 채우지 않습니다.
실제 학생 자료, 토큰, 비밀키는 넣지 않습니다.

### 시험 정책 복원은 메모 한 건 복원과 별도 절차입니다

`POST /api/policies/restore`는 서명된 안전 사본을 확인한 뒤 `test_policy_state`의 시험 정책에서 요청에 명시된 경로만 미리보기하고, 운영자의 별도 확인이 있을 때 그 범위만 적용합니다. 이 API는 `memo_backups`나 `memos`를 읽거나 복원하지 않으며, 메모 복원 감사 기록도 수정하지 않습니다. 선택하지 않은 규칙은 현재 값을 그대로 보존하고, 서비스 규칙과 감사 이력 관련 경로·값은 복원 범위로 허용하지 않습니다. 따라서 메모 내용 복원은 아래의 B 계정 메모 한 건 절차를, 정책 복원은 다음 시험 정책 절차를 각각 따르며 서로의 확인값을 섞지 않습니다.

## 시험 정책 복원 전 확인 (사본 검증 · 실패 시 중단 · 변경 범위)

`POST /api/policies/restore`는 시험 정책만 복원합니다. 이 경로가 읽고 쓰는 곳은 Supabase의 `test_policy_snapshots`(안전 정책 사본)와 `test_policy_state`(시험 정책, 한 행)이고, 쓰기는 `test_policy_state`의 그 한 행뿐입니다. 복원은 두 단계(`preview` → `confirm`)이며, `preview`가 복원할 사본의 버전과 바뀔 항목을 먼저 보여 줍니다. 메모 백업 테이블이나 메모 데이터는 이 절차의 대상이 아닙니다.
호출할 수 있는 사람: 로그인한 사용자 ID가 서버 환경변수 `POLICY_RESTORE_OPERATOR_ID`와 같은 운영자 한 명뿐입니다. 다르면 403 `POLICY_RESTORE_FORBIDDEN`입니다. `POLICY_SNAPSHOT_HMAC_KEY`(32바이트 이상)도 서버 환경변수로 필요하며, 두 값은 README, 코드, Git에 적지 않습니다.
`aleph.config.json`의 `restoreRoute`는 실제 정책 경로인 `POST /api/policies/restore`를 가리킵니다. 정책 복원 경로는 메모 복원 경로 `POST /api/memos/:id/restore`와 다릅니다.
`preview` 요청
```
{ "action": "preview", "version": "<안전 정책 사본의 버전>", "restorePaths": [ ... ] }
```
`restorePaths` 규칙은 `src/policy-restore.mjs`를 따릅니다. 다른 키가 있으면 400 `INVALID_RESTORE_REQUEST`입니다. 서버는 아래 순서로 확인하고, 어느 한 곳에서 실패하면 그 자리에서 멈추며 아무것도 쓰지 않습니다.
순서	확인	실패 시
1	그 `version`의 안전 정책 사본이 있는가	404 `POLICY_SNAPSHOT_NOT_FOUND` (같은 버전이 둘 이상이면 502 `INVALID_POLICY_SNAPSHOT_RESPONSE`)
2	사본의 서명(HMAC)이 맞는가	409 `POLICY_SNAPSHOT_UNVERIFIED`
3	사본 만든 시각이 침공 시각보다 앞인가	409 `POLICY_SNAPSHOT_INVALID`
4	시험 정책의 현재 상태를 읽을 수 있는가	502 `POLICY_TEST_STORE_UNAVAILABLE`
5	복원 범위(`restorePaths`)가 올바른가	400 `INVALID_POLICY_RESTORE_SCOPE`
통과하면 응답에 복원 전 변경 범위(`preview.changes`)가 담기고, 바뀔 항목이 있으면 5분 동안 유효한 `confirmationToken`이 함께 나옵니다. 바뀔 항목이 없으면 `applied:false`, `confirmationToken:null`이라서 복원할 것이 없습니다. 토큰은 호출한 운영자, 버전, 복원 범위, 시험 정책의 현재 상태에 묶여 있습니다.

### 시험 정책 복원 방법 (`POST /api/policies/restore`)

위 `preview`로 사본의 버전과 `preview.changes`를 확인합니다. 바뀔 항목이 예상한 범위뿐인지 사람이 직접 봅니다. 예상 밖이면 `confirm`을 보내지 않습니다.
맞으면 같은 운영자 계정으로 `confirm`을 보냅니다.
```
{ "action": "confirm", "confirmationToken": "<preview 응답의 토큰>" }
```
`confirm`은 다시 한 번 사본을 검증하고, 아래 경우에는 쓰지 않고 멈춥니다.
토큰이 틀렸거나 5분이 지났거나 다른 사용자의 것 → 409 `RESTORE_PREVIEW_EXPIRED_OR_INVALID`
미리보기 뒤 시험 정책이 바뀜 → 409 `POLICY_CHANGED_AFTER_PREVIEW`
사본 검증 실패 → 위 표와 같은 409·404
모두 통과하면 시험 정책의 `revision`이 읽은 값과 같을 때만 한 행을 갱신하고, 응답은 `applied:true`입니다. 갱신 결과가 쓰려던 내용과 다르거나 그 사이에 바뀌었으면 502 `POLICY_TEST_STORE_UNAVAILABLE`입니다. 선택하지 않은 다른 규칙은 기존 값을 유지하고 감사 이력은 복원·수정하지 않습니다.
확인이 필요한 것 (README만으로는 알 수 없음)
`restorePaths`와 `preview.changes`의 계산은 `src/policy-restore.mjs`가 합니다.
요청 검사는 `src/resource-id.mjs`의 `RESOURCE_IDS.testPolicyRestore`와 `src/memos.mjs`의 `memosContext`를 거칩니다.
`test_policy_snapshots`, `test_policy_state` 테이블의 마이그레이션이 저장소에 있는지 확인합니다.
복원 경로가 엔진 판정(`decider.mjs`, `allowedRoutes`)에서 허용되는지는 별도로 확인합니다.

### 로컬 파일 정책 사본 확인 (policy-guard)

위 API와는 별개로, 저장소 파일 정책(`src/decider.mjs`, `aleph.config.json`, `supabase/migrations/*.sql`)의 안전 사본은 `scripts/policy-guard.mjs`로 확인합니다. 이 도구는 `.policy-guard/` 안에서만 쓰고 운영 정책 파일은 읽기만 합니다. 저장소 루트에서 실행합니다.
1. 안전 정책 사본의 버전 확인
```
node scripts/policy-guard.mjs verify
```
사본의 버전 해시, 만든 시각, 기준 커밋, 파일별 해시가 나옵니다. 위 표의 「안전 정책 사본 버전 해시」와 같은지 직접 대조합니다. 다르면 복원하지 않습니다.
2. 복원 전 바뀔 항목(변경 범위) 확인
```
node scripts/policy-guard.mjs diff
```
비교 기준(검증된 사본)의 버전과 변경 범위(전체 몇 개 파일 중 몇 개)가 나오고, 시험 정책에서 바뀐 줄만 표시됩니다. 이 출력이 바뀔 항목의 전부여야 합니다. 예상 밖의 파일이나 줄이 있으면 복원하지 않습니다.
3. 중단 조건 — 아래 중 하나라도 해당하면 복원을 멈춥니다. 1·2번 명령도 이 경우 `중단:` 메시지를 내고 종료 코드 1로 끝납니다.
안전 정책 사본이 없음 (`검증된 사본이 없습니다`)
사본 파일이 빠졌거나 파일별 해시가 기록과 다름 (`사본 파일이 없습니다` / `해시가 맞지 않습니다`)
사본 전체 버전 해시가 맞지 않음
시험 정책이 지금의 검증된 사본과 다른 버전에서 만들어짐
한 번에 돌릴 때는 앞 단계가 실패하면 다음으로 넘어가지 않도록 `&&`로 잇습니다.
```
node scripts/policy-guard.mjs verify && node scripts/policy-guard.mjs diff
```
4. 사람의 최종 확인 — 1번의 버전 해시와 2번의 바뀔 항목을 눈으로 확인한 뒤에만 다음 「시험 정책 복원 방법」으로 넘어갑니다.
로컬 시험 사본 되돌리기 (policy-guard)
위 확인 1~4가 모두 끝난 뒤에만 실행합니다. 이 명령은 로컬 폴더의 시험용 사본만 지우며, 서버의 시험 정책(`test_policy_state`)과는 무관합니다.
```
rm -rf .policy-guard/sim
```
시험용 사본(`.policy-guard/sim`)만 지웁니다. 시험 정책이 사라지고 검증된 사본(`.policy-guard/safe`)의 정책만 남습니다. 운영 정책 파일과 검증된 사본은 건드리지 않습니다.
복원 뒤에 다시 확인합니다.
`node scripts/policy-guard.mjs verify` 가 통과하고, 마지막 `참고:` 줄이 실제 정책 파일의 사본과의 차이를 보여 줌
`git status` 에 정책 파일 변경이 없음 (정책 변경은 별도 커밋으로만)
`node scripts/policy-guard.mjs diff` 는 시험용 사본이 없으므로 `시험용 사본이 없습니다`로 멈춤 (정상)
아래 표의 P-1~P-4는 로컬 도구(policy-guard), P-5~P-9는 서버 정책 경로(`POST /api/policies/restore`) 확인입니다.
#	확인	결과
P-1	사본 검증(`verify`) 통과, 버전 해시를 기록과 대조	미실행
P-2	바뀔 항목(`diff`)이 예상한 범위뿐	미실행
P-3	사본이 없거나 해시가 틀리면 멈추는지 (일부러 확인)	미실행
P-4	시험 사본 폐기 뒤 `verify` 통과, `git status` 정책 파일 변경 없음	미실행
P-5	`restoreRoute`가 배열이고 `api`가 설정 오류로 멈추지 않음 (`node --test test/policy-restore-route.test.mjs`)	미실행
P-6	운영자가 아닌 계정으로 호출 → 403 `POLICY_RESTORE_FORBIDDEN`	미실행
P-7	`preview`: 사본 검증을 거쳐 변경 범위(`preview.changes`)와 확인 토큰이 나옴	미실행
P-8	없는 `version` → 404, 서명이 맞지 않는 사본 → 409, 아무것도 쓰지 않음	미실행
P-9	`confirm`: 적용 뒤 `applied:true`. 미리보기 뒤 시험 정책이 바뀌면 409	미실행

### 메모 한 건 복원 방법 (`POST /api/memos/:id/restore`, 시험 계정 B)

이 절은 비공개 `memo_backups` 사본에서 B의 지정된 메모 한 건만 복원합니다. 시험 정책 경로와 독립적이며, 정책 사본 버전이나 정책 확인 토큰을 사용하지 않습니다.
먼저 `{ "dryRun": true }`로 호출합니다. 복원할 버전(ID·소유자·내용 해시)과 변경 범위(1건, update 또는 insert, 다른 메모 0건)가 나옵니다. 아무것도 쓰지 않습니다. 현재 README 표의 ID·소유자 ID·SHA-256은 dryRun 응답을 확인한 뒤 그대로 기록해야 합니다. 현재 `src/restore-target.mjs`가 미설정이므로 먼저 지정된 가상 대상이 설정되어야 하며, 지금은 dryRun 응답을 얻을 수 없습니다.
보인 내용이 맞으면 `{ "confirmContentSha256": "<위에서 본 해시>" }`로 호출합니다. 해시가 다르면 409로 멈춥니다.
성공 응답의 `matchesBackup: true`를 확인합니다.
지키는 것
복원 대상 한 건의 ID·소유자·내용 해시가 사본과 같아야 합니다. 쓰기 전에 사본 해시를 다시 계산해 대조하고, 쓴 뒤에도 다시 읽어 대조합니다. 하나라도 다르면 실패로 답합니다.
다른 메모는 읽지도 쓰지도 않습니다. 삭제나 전체 덮어쓰기는 없습니다.
감사 기록은 수정하지 않습니다. 복원 시도마다 한 줄(JSON)을 덧붙이기만 하며, 메모 내용은 남기지 않고 ID와 해시만 남깁니다. Vercel에서는 파일에 덧붙일 수 없으므로 런타임 로그가 이 로그 파일 역할을 합니다.
메모 복원 경로는 정책 변경과 별도 커밋으로 허용합니다(`patches/restore-route-policy.patch`).
확인 기록 (실제로 돌린 뒤 채우기)
확인한 날짜:
배포 커밋 SHA:
dryRun 결과(ID·소유자·해시):
복원 결과 `matchesBackup`:
다른 메모가 그대로인지 확인한 방법:
> 위 칸이 비어 있는 동안에는 "복원이 확인됐다"고 쓰지 않습니다.
---
복구 뒤 1~9단계 재확인 순서
복구한 뒤 자료와 정책이 돌아왔는지, 이전에 막던 요청이 다시 거부되는지 아래 순서로 봅니다.
결과 칸은 직접 실행한 것만 채웁니다. 실행하지 않은 시험은 `미실행`으로 둡니다. 기대값은 코드에서 확인되는 것만 적었고, 단계 원고에 맞춰 채워야 하는 칸은 `⟨채움⟩`으로 비워 두었습니다.
0. 준비 (먼저 기록)
확인 날짜: 　　배포 주소: 　　Production 배포 커밋 SHA:
계정: 시험 계정 A(다른 사용자), 시험 계정 B(복원 대상 소유자), 강사 계정(`isInstructor` 통과), 등록되지 않은 기기 하나
삭제(DELETE) 시험은 복원 대상이 아닌 다른 가상 메모로만 합니다.
실제 토큰·비밀키는 화면 캡처, 로그, README에 남기지 않습니다.
1. 정책이 돌아왔는지
#	확인	기대	결과
1-1	`node scripts/policy-guard.mjs verify`	사본 검증 통과(해시 일치). 실제 파일과의 차이는 `src/decider.mjs`, `aleph.config.json` 두 개뿐이고, 그 내용이 `patches/restore-route-policy.patch`와 같음 (사본을 패치 전에 만든 경우)	미실행
1-2	`git diff` 로 정책 변경 커밋 확인	변경 범위가 복원 경로 추가분뿐이고 다른 규칙 줄은 그대로	미실행
1-3	`supabase/migrations/*.sql` 목록	이전 단계 마이그레이션 변경 없음, `memo_backups` 마이그레이션만 추가	미실행
2. 자료가 돌아왔는지 (시험 계정 B)
#	요청	기대	결과
2-1	`POST /api/memos/<대상 ID>/restore` 본문 `{"dryRun":true}`	200, 복원 버전의 ID·소유자·내용 해시 표시, 변경 범위 1건·다른 메모 0건	미실행
2-2	같은 경로, 본문 `{"confirmContentSha256":"<2-1의 해시>"}`	200, `restored:true`, `matchesBackup:true` (이미 같으면 `restored:false`)	미실행
2-3	B 계정으로 `GET /api/memos/<대상 ID>`	200, 복원한 제목·본문, 내용 해시가 사본과 같음	미실행
2-4	B의 다른 가상 메모와 계정 A의 메모를 복원 전후로 비교	변경 없음	미실행
2-5	런타임 로그에서 `memo_restore_audit` 줄 확인	시도마다 줄이 추가됨, 이전 줄은 그대로, 메모 내용 없이 ID·해시만	미실행
3. 정상 요청 (허용돼야 함)
#	요청	계정	기대	결과
3-1	`GET /api/memos/:id` 본인 메모	B	200, `id`·`title`·`body`만	미실행
3-2	`PUT /api/memos/:id` 본문 `title`,`body`	B	200	미실행
3-3	`DELETE /api/memos/:id` (복원 대상이 아닌 메모)	B	204	미실행
3-4	`GET /api/notes/:id` (공지)	로그인한 계정	200, `id`·`title`·`content`	미실행
3-5	`PUT /api/notes/:id`	강사	200	미실행
3-6	등록된 기기의 평상시 요청	B	판정 `allow`	미실행
3-7	⟨1~9단계 원고의 다른 정상 요청⟩	⟨채움⟩	⟨채움⟩	미실행
4. 금지 요청 (거부돼야 함)
#	요청	계정	기대	결과
4-1	로그인 없이 `/api/memos/:id`	없음	거부 (상태 코드는 `memosContext` 기준, ⟨확인⟩)	미실행
4-2	다른 사람 메모에 GET·PUT·DELETE	A가 B의 메모	404 `NOT_FOUND` (없는 메모와 같은 응답)	미실행
4-3	`PUT` 본문에 `owner_id`/`ownerId`/`user_id`/`userId`	B	403 `OWNER_CHANGE_FORBIDDEN`	미실행
4-4	UUID가 아닌 ID	B	404	미실행
4-5	`PUT /api/notes/:id`	강사 아닌 계정	403 `INSTRUCTOR_REQUIRED`	미실행
4-6	쿼리 문자열을 붙인 요청 (`?x=1`)	B	판정 `deny`, `resource_route_not_allowed`	미실행
4-7	허용 목록에 없는 경로·메서드 (예: `POST /api/memos/:id`)	B	판정 `deny`, `resource_route_not_allowed`	미실행
4-8	등록되지 않은 기기에서 요청	B	판정 `deny`, `device_not_registered`	미실행
4-9	위험 신호(야간·비정상 네트워크·최근 위험 이벤트)가 겹친 요청, 추가 인증 없음	B	판정 `step_up`, `step_up_required`	미실행
4-10	복원 경로에 다른 메모 ID	B	404	미실행
4-11	복원 경로에 B가 아닌 계정	A	404	미실행
4-12	복원 경로에 확인 해시 없이 호출	B	400 `CONFIRMATION_REQUIRED`, 아무것도 쓰지 않음	미실행
4-13	복원 경로에 틀린 확인 해시	B	409 `CONFIRMATION_MISMATCH`, 아무것도 쓰지 않음	미실행
4-14	복원 경로에 `GET` 등 `POST` 아닌 메서드	B	405	미실행
4-15	비공개 사본 테이블(`memo_backups`)을 브라우저·공개 키로 직접 조회	없음	접근 불가	미실행
4-16	⟨1~9단계 원고의 다른 금지 요청⟩	⟨채움⟩	⟨채움⟩	미실행
5. 공개 노출 재확인 (README 위쪽 「가상 메모 문장 노출 확인」 절차 그대로)
현재 Production 배포의 `/`, `/data.json`, `/api/notes`에서 네 문장(`실습용 가상 과제 기록`, `실습용 가상 포트폴리오 기록`, `실습용 가상 리추얼 기록`, `실습용 가상 행정 기록`)을 찾습니다. 기대값은 2단계 이후 원고 기준으로 채웁니다.
#	확인	기대	결과
5-1	`/data.json` 비로그인 요청	⟨채움⟩	미실행
5-2	`/api/notes` 비로그인 요청	⟨채움⟩	미실행
5-3	자료실 첫 화면(`/`)	⟨채움⟩	미실행
과거 커밋이나 과거 배포에서 노출됐던 사실은 이 확인으로 없어지지 않습니다. 현재 상태만 기록합니다.
6. 로컬 시험 (운영 판정 결과가 아님)
#	명령	결과
6-1	`node --test test/memo-restore.test.mjs`	미실행 (제 환경의 가짜 DB 시험 12개는 통과했으나, 선생님 저장소에서는 아직 돌리지 않음)
6-2	`npm run decider:test`	미실행
6-3	`npm run detect:test`	미실행
6-4	`npm run fixture:7`	미실행
6-5	`npm run xdr:run`	미실행
6-6	`npm run test:r5`, `npm run test:package`	미실행
7. 결과 판단 기준
2번이 모두 통과하고 4번의 금지 요청이 모두 거부될 때만 "자료와 정책이 돌아오고 이전에 막던 요청이 다시 거부됨"이라고 적습니다.
`미실행`이 하나라도 남은 표는 완료로 쓰지 않고, 남은 항목 수를 함께 적습니다.
금지 요청이 하나라도 허용되면 그 줄에 실제 응답(상태 코드)을 적고, 복구를 완료로 표시하지 않습니다.
