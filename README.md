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
`aleph.config.json`의 `allowedRoutes`는 위 메서드와 경로 그대로입니다. (`GET /api/notes`, `GET·POST /api/memos`, `GET·PUT·DELETE /api/memos/:id`)
다시 확인하는 방법
A 계정으로 배포 주소에 로그인합니다. 브라우저에서 `F12`를 눌러 Console을 엽니다.
B 계정 소유의 시험 메모 id(`00000000-0000-4000-8000-00000000b001`)로 `GET`·`PUT`·`DELETE`를 보냅니다. 거부되어야 합니다. (`404`)
A 본인 메모 id로 `GET`·`PUT`·`DELETE`를 보내면 정상이어야 합니다. (`200`, `200`, `204`) 본문에 `owner_id`를 넣은 `PUT`은 `403`입니다.
시크릿 창에서 로그인 없이 `/api/memos`를 열면 `401`이어야 합니다.
확인 상태와 남은 일
확인함: 가짜 DB로 A/B 시나리오 13개(본인 접근 유지, 상대 메모 접근 거부, 소유자 변경 거부, 무로그인 거부)를 로컬에서 시험했고 모두 통과했습니다.
미확인: 실제 Supabase·Vercel 배포 환경에서의 시험 결과는 아직 기록하지 않았습니다. 위 "다시 확인하는 방법"을 실행한 뒤 결과를 여기에 적습니다.
남은 일: DB 권한(RLS 등) SQL은 다음 단계에서 다룹니다. `/api/notes`와 `/api/memos`의 호출 제한은 아직 없습니다. `aleph.config.json`의 `step` 값은 `build-public.mjs`의 점검 때문에 아직 `1`이며, 저장점 단계에서 함께 정리합니다.
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
`aleph.config.json`의 `allowedRoutes`와 같습니다.
메서드·경로	동작	로그인 없음
`POST /api/login`	이메일·비밀번호 → `{access_token, expires_in, email}`	-
`GET /api/notes`	가상 메모 `{notes:[{title,content}]}`	`401`
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
`aleph.config.json`의 `step`은 `build-public.mjs`·`deployment-identity.mjs`의 점검 때문에 아직 `1`입니다. 저장점 단계에서 함께 정리합니다.
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