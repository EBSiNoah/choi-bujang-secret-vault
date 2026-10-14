# 학생 판정기 요청·응답 계약 v2

`src/decider.mjs`의 `decide(request)`는 반 엔진이 신원, 기기, 경로 및 아래 권한 증거를 확인한 뒤 전달한 요청만 받습니다. `subjectId`는 계속 가명 ID이며 Supabase 사용자 번호와 직접 비교하지 않습니다. 이 v2 계약은 엔진이 확장되어 검증된 자료 권한 정보를 보낼 수 있다는 전제입니다. 엔진 구현도 이 문서와 함께 v2로 변경되어야 합니다. 아직 운영 엔진이 v2를 보내거나 새 `reasonCode`를 등록했다고 보장하지 않습니다.

## 요청

요청 객체에는 아래 필드만 허용합니다. 누락·추가 필드, 잘못된 형식, 경계가 맞지 않는 권한 증거는 유효하지 않은 계약입니다. 엔진은 요청을 만들 때 인증 사용자와 실제 HTTP 요청·DB 권한을 검증해야 하며, 브라우저가 전달한 권한 값을 그대로 복사하면 안 됩니다.

| 항목 | 뜻 |
|---|---|
| `schema` | 항상 `aleph.decision.v2` |
| `requestId` | 엔진이 만든 이번 요청의 UUID. 권한 증거와 응답에 같은 값 사용 |
| `classId`, `projectId` | 운영 엔진이 확인한 반과 학생 프로젝트 |
| `subjectId` | 엔진이 만든 가명 주체 ID. DB 사용자 ID로 사용하지 않음 |
| `deviceId` | 확인된 기기의 16자리 소문자 16진수 ID. 개인키가 아님 |
| `service`, `method`, `path`, `route` | 엔진이 확인한 서비스, HTTP 메서드, 정규 경로, 경로 패턴. 아래 허용 목록과 정확히 일치해야 함 |
| `resourceId` | 자료 구역 선택자. 공지는 `teacher-announcements`, 메모는 `personal-memos`. 쿼리로 자료나 동작을 선택하지 않음 |
| `queryLength`, `querySha256` | 쿼리 원문의 길이와 SHA-256. 현재 허용 경로는 빈 쿼리만 받음 |
| `at` | 엔진이 만든 UTC ISO 시각. 판정 시각과 5초 넘게 차이 나면 거부 |
| `policyRevision` | 이번 요청에 적용된 정책 버전 |
| `deviceRegistered` | 기기 등록 여부. 실제 릴레이는 미등록 기기를 판정기보다 먼저 막음 |
| `stepUp` | `{verified, authAgeSeconds}`. false이면 나이는 `null`; true이면 0~900초. 이 값만 보고 재인증 확인 요청을 건너뛰지 않음 |
| `recentEvents` | 엔진이 제공한 최근 사건 배열. 최대 12건, 항목은 `{kind, ageSeconds, count}` |
| `signals` | `{source, region, network, hour}`. 실제 경로에서는 현재 `source: "none"`, `region/network: "unknown"`. `judge_fixture`를 실제 위치 증거로 취급하지 않음 |
| `verifiedAuthorization` | 아래 구조의 엔진 생성 권한 증거. 이번 요청의 메서드·경로·서비스·자료 ID·가명 주체·요청 ID와 전부 일치해야 함 |

`verifiedAuthorization`은 정확히 다음 필드로 구성합니다.

```json
{
  "requestId": "이번 요청의 requestId와 동일",
  "subjectId": "이번 요청의 subjectId와 동일한 가명 ID",
  "resourceId": "이번 요청의 resourceId와 동일",
  "service": "이번 요청의 service와 동일",
  "method": "이번 요청의 method와 동일",
  "path": "이번 요청의 path와 동일",
  "memoOwnerMatchesSubject": true,
  "canEditAnnouncements": false
}
```

- `memoOwnerMatchesSubject`는 메모 단건 경로에서만 의미가 있습니다. 엔진은 인증된 로그인 사용자와 해당 경로의 메모 UUID를 DB에서 조회해 실제 `owner_id`가 그 사용자와 일치하는지 검사하고 `true` 또는 `false`를 넣습니다. 메모 단건이 아닌 요청은 `null`을 넣습니다. 알 수 없거나 조회에 실패하면 메모 단건 접근은 허용하지 않습니다.
- `canEditAnnouncements`는 엔진이 인증 정보의 신뢰 가능한 강사 권한과 공지 수정 권한을 확인해 만든 boolean입니다. 학생이 보낸 역할·본문 값을 근거로 만들면 안 됩니다. 확인이 안 되면 `false`입니다.
- 이 증거는 경로 UUID와 현재 요청에 결합되어야 합니다. 다른 사용자, 다른 메모 ID, 다른 서비스·메서드·경로·자료 ID 또는 다른 요청 ID의 증거는 재사용할 수 없습니다.
- 이 계약의 JSON 예시 값 자체는 가상 예시입니다. 실제 요청에 클라이언트가 해당 객체를 보낼 권한이 있다는 뜻이 아닙니다. 권한 증거는 반드시 신뢰 경계 안의 엔진이 생성합니다.

## 허용 경로

경로는 아래 경로·메서드·자료 ID·`route`가 정확히 일치해야 합니다. UUID는 한 경로 구성요소여야 하며, 뒤에 `/export` 같은 기능 경로를 붙이는 것은 허용하지 않습니다. 쿼리는 빈 문자열만 허용합니다.

| 자료 ID | 메서드 | 경로 | 판정 조건 |
|---|---|---|---|
| `teacher-announcements` | `GET` | `/notes` | 등록 기기 |
| `teacher-announcements` | `GET` | `/notes/:id` | 등록 기기 |
| `teacher-announcements` | `PUT` | `/notes/:id` | 등록 기기 및 `canEditAnnouncements: true` |
| `personal-memos` | `GET` | `/memos` | 등록 기기. 실제 API도 인증 사용자 소유의 행만 조회해야 함 |
| `personal-memos` | `GET` | `/memos/:id` | 등록 기기 및 이 메모에 결합된 `memoOwnerMatchesSubject: true` |
| `personal-memos` | `PUT` | `/memos/:id` | 등록 기기 및 이 메모에 결합된 `memoOwnerMatchesSubject: true` |

메모 단건의 소유권 증거가 `false` 또는 `null`이면 거부합니다. 공지 수정 권한이 `false`이면 거부합니다. 자료 ID, 메서드, 경로가 맞지 않거나 알 수 없는 경로면 거부합니다. 이 판정기는 브라우저 화면의 메뉴 표시 여부를 권한 증거로 쓰지 않습니다. 메모 소유자 검증과 공지 역할 확인은 실제 자료 API에서도 따로 강제되어야 합니다.

## 응답

`decide(request)`는 아래 다섯 필드만 반환하고 요청의 스키마 버전과 ID를 그대로 돌려줍니다.

```js
{
  schema: 'aleph.decision.v2',
  requestId: request.requestId,
  decision: 'allow', // 'allow' | 'deny' | 'step_up'
  reasonCode: 'approved',
  ruleIds: ['device_registered'],
}
```

현재 구현은 자료 권한 거부에 `resource_forbidden`, 미등록 경로·자료에 `unknown_path`를 사용합니다. 이 코드는 운영 등록부의 `allowedReasonCodes`에 v2 정책 배포 전 등록되어야 합니다. 거부와 추가 확인에는 적어도 하나의 구현된 규칙 ID가 필요합니다. 운영 등록부에 코드·규칙이 없거나 응답이 늦고 형식·요청 ID가 맞지 않으면 엔진은 접근을 허용하지 않아야 합니다. `allow`도 엔진의 앞선 신원·기기·경로 검사를 되돌릴 수 없습니다.

`step_up`은 엔진에 추가 본인 확인을 요청합니다. 단순 `deny`는 재인증 화면으로 이어지지 않습니다. 기존 등록 기기·복합 이상 접속 규칙은 유지합니다. `npm run decider:test`와 `npm run fixture:7`은 가상 요청 연습일 뿐, 운영 엔진 연결·실제 접근 차단·심판 판정의 증거가 아닙니다.

가상 복합 이상 접속은 `signals.source`가 `judge_fixture`이고, `signals.network`가 `unusual`이며, 시각이 06:00 이전 또는 22:00 이후이고, `recentEvents`에 `kind: 'burst_read'` 및 `count > 120`인 사건이 모두 있을 때만 `step_up`입니다. 120건은 기준에 미달하며, 이 조합은 가상 연습에만 적용됩니다. 등록 기기가 아니면 이 조건보다 먼저 거부합니다.

## 엔진 통합 시 해야 할 일

1. 운영 엔진의 요청 생성기와 스키마 검증기를 함께 v2로 갱신하고, 구형 v1 요청은 허용하지 않도록 합니다.
2. 원래 요청의 인증 사용자와 실제 메모 행을 신뢰 경계 안에서 조회해 소유권 boolean을 생성합니다. 역할도 인증된 서버 측 정보로 확인합니다. 요청 본문·쿼리·브라우저 상태를 권한의 근거로 삼지 않습니다.
3. 권한 증거를 `requestId`, `subjectId`, 자료 ID, 서비스, 메서드 및 정확한 경로에 결합하고, 해당 요청 판정에만 사용합니다.
4. 정책 배포 전에 `resource_forbidden`과 `unknown_path`, 이 문서의 규칙 ID가 운영 등록부·허용 코드·정책 버전에서 허용되는지 확인합니다. 엔진이 아직 v2를 지원하지 않으면 배포하지 않습니다.
5. API 서버에서도 A의 자기 메모 읽기·수정 허용, B의 A 메모 거부, 일반 학생의 공지 수정 거부를 별도로 시험합니다. 판정기 가상 fixture만으로 실제 API 보호를 증명하지 않습니다.

현재 운영 엔진의 소스 및 등록부는 이 프로젝트에서 확인하거나 수정할 수 없습니다. 따라서 엔진 측 v2 구현·이유 코드 등록·배포는 별도로 완료해야 합니다.

## 구현 전 확인

1. 규칙이 참일 때만 허용하고 권한 정보가 없거나 경계가 맞지 않으면 거부합니다.
2. `subjectId`는 가명 ID로 유지하며 DB `owner_id`와 직접 비교하지 않습니다.
3. 실제 학생 계정, 토큰, 기기 개인키, 자료 본문을 판정 요청·로그·제출 묶음에 넣지 않습니다.
4. `npm run decider:test`는 가상 요청 연습입니다. 이 결과를 실제 접근 시험 또는 심판 판정으로 보고하지 않습니다.
