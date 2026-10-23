# 시험 정책 복원 절차 — 검증·미리보기·확인

이 절차는 **서버의 시험 정책(`test_policy_state`)만** 복원합니다. 저장소의 `.policy-guard/safe` 파일을 덮어쓰거나 운영 정책·운영 DB를 수정하지 않습니다. API가 받아들이는 안전 사본은 `test_policy_snapshots`에 저장된 서명된 버전입니다. 로컬 `policy-guard`의 SHA-256 버전과 DB 사본 버전은 서로 다른 식별자이며 자동으로 연결되어 있지 않습니다. 복원할 DB 사본이 로컬에서 검증한 것과 같은 정책 내용인지, 운영자가 버전과 내용을 확인한 뒤 사용하세요. 사본 버전이 없거나 HMAC 서명이 유효하지 않으면 서버가 복원을 거부합니다.

## 사전 조건

- `test_policy_snapshots`에 침공 시각보다 먼저 만들어진 안전 사본 버전이 있어야 합니다. 각 사본의 HMAC 서명은 서버의 `POLICY_SNAPSHOT_HMAC_KEY`로 검증됩니다.
- 서버 환경변수 `POLICY_RESTORE_OPERATOR_ID`에는 승인된 운영자 사용자 ID, `POLICY_SNAPSHOT_HMAC_KEY`에는 최소 32바이트 키가 설정되어 있어야 합니다. 값은 설정 화면의 비밀 입력란에만 입력하고 README, Git, 요청 기록, 로그에 복사하지 마세요.
- `aleph.config.json`의 `restoreRoute`가 `POST /api/policies/restore`를 가리켜야 합니다. 이 설정은 API의 정책 복원 경로이며 자료 메모 복원 경로와 별개입니다.
- 승인된 운영자 계정으로 로그인합니다. API는 `X-Resource-ID: test-policy-restore-v1` 헤더도 요구합니다.

## 1. 먼저 변경 범위 미리보기

아래 예시는 메모 소유권 정책만 복원하도록 `/resourceAccess/memos` 범위를 선택합니다. 실제로 사본의 이 경로에 소유권 규칙이 있는지, preview가 정확히 예상한 변경만 보여 주는지 확인하세요. 사본의 버전 문자열을 직접 확인한 값으로 바꿉니다.

브라우저 개발자 도구 Console에서 실행할 수 있습니다. 이 대화형 코드를 실행하려면 로컬 모델에서 진행해야 합니다. 응답에 들어 있는 확인 토큰은 비밀 취급하고 공유하거나 로그에 남기지 마세요.

```js
const accessToken = sessionStorage.getItem('vault.token');
if (!accessToken) throw new Error('운영자 계정으로 먼저 로그인하세요.');

const previewResponse = await fetch('/api/policies/restore', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'X-Resource-ID': 'test-policy-restore-v1',
  },
  body: JSON.stringify({
    action: 'preview',
    version: '<test_policy_snapshots의 확인된 안전 사본 버전>',
    restorePaths: ['/resourceAccess/memos'],
  }),
});
const preview = await previewResponse.json();
console.log(previewResponse.status, preview.applied, preview.preview?.version, preview.preview?.changes);
```

정상 미리보기는 HTTP 200, `applied: false`, 선택 버전과 `preview.changes`를 반환합니다. 확인 토큰은 변경이 있을 때만 나옵니다. `changes`가 비어 있으면 이미 같은 상태이므로 확인할 복원이 없습니다.

**복원 전 화면에서 꼭 확인할 것:**

1. `preview.version`이 사람이 선택한 안전 버전과 정확히 같은지 확인합니다.
2. `preview.changes`의 각 경로와 `before`/`after` 값이 모두 의도한 메모 소유권 정책 범위인지 확인합니다.
3. 서비스 규칙이나 감사 이력 변경이 보이거나, 예상하지 못한 경로가 하나라도 있으면 확인 요청을 보내지 말고 중단합니다.

API는 `/services`, `/serviceRules`, 감사 관련 경로를 선택 범위로 받지 않으며, 선택한 값 내부에 서비스·감사 키가 있어도 거부합니다. 적용 시 현재 정책 전체를 읽어 선택 경로만 바꾸므로 선택하지 않은 다른 서비스 규칙과 감사 이력은 현재 값을 그대로 보존합니다. 쓰기는 시험 정책의 singleton 한 행에만 revision 조건을 걸어 적용합니다.

## 2. 변경 범위가 맞을 때만 확인

preview가 보여 준 정확한 `confirmationToken`을 같은 운영자 로그인으로 전달합니다. 토큰은 5분 동안 유효하며 버전·경로·현재 정책 상태·미리보기에 묶여 있습니다. 아래 코드는 `preview` 객체가 방금 위 요청에서 받은 응답이라고 가정합니다.

```js
if (previewResponse.status !== 200 || preview.applied !== false
    || !preview.preview?.changes?.length
    || !preview.confirmationToken) {
  throw new Error('정상적인 변경 미리보기가 없어 복원을 중단합니다.');
}

// 화면에서 preview.preview.changes 전체를 직접 확인한 뒤에만 이 블록을 실행합니다.
const confirmResponse = await fetch('/api/policies/restore', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'X-Resource-ID': 'test-policy-restore-v1',
  },
  body: JSON.stringify({
    action: 'confirm',
    confirmationToken: preview.confirmationToken,
  }),
});
const result = await confirmResponse.json();
console.log(confirmResponse.status, result.applied, result.preview?.version, result.preview?.changes);
```

복원 적용을 확인하려면 HTTP 200과 `applied: true`를 확인합니다. 확인 단계에서도 사본 서명을 다시 검증하고 미리보기 당시 시험 정책이 그대로인지 확인합니다. 토큰 만료·불일치는 `409 RESTORE_PREVIEW_EXPIRED_OR_INVALID`, 미리보기 후 정책 변경은 `409 POLICY_CHANGED_AFTER_PREVIEW`입니다. 이런 응답이면 재시도하지 말고 새 preview부터 다시 검토합니다.

없는 사본은 `404 POLICY_SNAPSHOT_NOT_FOUND`, 잘못된 서명은 `409 POLICY_SNAPSHOT_UNVERIFIED`, 시험 저장소 읽기·쓰기 오류는 `502 POLICY_TEST_STORE_UNAVAILABLE`입니다. 실패 응답을 성공으로 간주하거나 확인을 우회하지 마세요.

## 3. 자료 소유권 회귀 확인 (A/B)

정책 복원 뒤 별도로 자료 API의 실제 인증·소유자 검사를 확인합니다. A가 소유한 가상 메모의 ID를 사용하고, 토큰이나 메모 본문은 기록하지 않습니다. 이 대화형 API 요청도 로컬 모델에서 직접 수행하세요.

- **B 계정이 A의 메모를 요청:** `GET /api/memos/<A의 가상 메모 ID>`를 B의 로그인 상태로 호출합니다. 기대 결과는 `404 {"error":"NOT_FOUND"}`입니다.
- **A 계정의 정상 요청:** 같은 메모를 A의 로그인 상태로 `GET`합니다. 기대 결과는 `200`과 해당 메모의 `{id,title,body}`입니다.
- 같은 시험 정책 복원 변경 전후에 위 두 결과가 유지되는지 확인합니다. 예상과 다르면 복원을 성공으로 기록하지 말고 배포·인증·정책 설정을 조사합니다.

이 결과는 실제 배포에서 직접 실행했을 때만 운영 확인으로 기록할 수 있습니다. 로컬 가짜 DB 테스트는 회귀 시나리오의 코드 검증일 뿐 실제 계정·DB·배포 결과를 증명하지 않습니다.

## 로컬 코드 시험

```sh
npm run test:policy-restore
```

이 테스트는 시험 저장소·인증 응답을 모의해 안전 사본 검증, 미리보기 후 확인, 서비스 규칙·감사 이력 보존, B의 A 메모 접근 거부, A 정상 메모 접근 유지를 검사합니다. 실제 DB나 배포 API를 호출하지 않습니다.

## 중단 및 범위

- 안전 사본 버전이나 서명이 확인되지 않으면 preview/confirm을 진행하지 않습니다.
- 예상하지 못한 변경, 서비스 규칙 또는 감사 이력 경로, 만료된 확인 토큰은 중단 사유입니다.
- 이 절차는 **시험 정책 전용**입니다. 운영 정책이나 운영 자료를 복원하는 기능이 아닙니다.
- `npm run test:policy-guard`는 로컬 `.policy-guard` 파일 사본 도구 시험입니다. 서버 DB 사본을 만들거나 이 API를 호출하지 않습니다.
