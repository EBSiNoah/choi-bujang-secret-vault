# XDR 보너스 경보

이 폴더는 보너스 여섯 개의 연습 경보입니다. 경보는 수업용으로 만든 Wazuh 모양이며, 실제 로그가 아닙니다. 정답은 이 저장소에 없습니다.

## 경보 묶음

`xdr/fixtures/<moduleKey>.json` 을 읽습니다. `moduleKey` 는 아래 여섯 개입니다.

| moduleKey | 보는 것 |
|---|---|
| `brute-force` | 짧은 시간에 몰린 로그인 실패 |
| `web-injection` | 웹 요청에 섞인 주입 형태 |
| `known-cve` | 이미 공개된 취약점을 노린 요청 형태 |
| `persistence` | 다시 켜도 남도록 심긴 서비스·예약 작업 |
| `privilege` | 평범한 계정의 갑작스러운 권한 상승 |
| `exfiltration` | 처음 보는 곳으로 빠지는 큰 전송 |

한 파일에는 명확한 공격, 애매한 시도, 정상 이벤트가 함께 들어 있습니다. 주소는 문서용 대역만 쓰고, 계정은 `user01` 같은 가상 이름입니다. `known-cve` 의 원격 조회 구문은 문서용 표기입니다. 그 문자열을 다른 시스템에 넣거나 변형하지 않습니다.

## 학생이 만드는 파일

항목마다 `xdr/<moduleKey>/decide.mjs` 를 만듭니다. `decide(alert)` 를 내보냅니다. 비동기 함수여도 됩니다. 반환은 아래 세 값입니다.

- `action`: `block`, `alert`, `record` 중 하나
- `confidence`: 0 이상 1 이하 숫자
- `reason`: 짧은 이유

명확한 공격은 `block`, 애매한 시도는 `alert`, 정상 이벤트는 `record` 입니다. 경보 원본은 고치지 않습니다.

## 경보 내용 확인

무차별 로그인 연습 경보의 시각·출발 주소·계정·규칙 수준·설명만 확인하려면 저장소 루트에서 `node xdr/brute-force/read-alerts.mjs` 를 실행합니다. 이 읽기 모듈은 판정기와 독립되어 있으며, 비밀처럼 보이는 문자열은 출력 전에 가립니다.

## 차단 후보 연결

`xdr/brute-force/respond.mjs`의 `createResponder({ ztna })`는 `decide(alert)`의 `block` 결과에 대해서만 `ztna.addDenyRule(rule)`을 호출합니다. 규칙은 출발 주소만 대상으로 하고, 만료 시각과 근거 경보 id를 포함합니다. `alert` 결과는 `xdr/alerts.log`에 알림으로 남고 `record`는 규칙을 만들지 않습니다. 기본 로그 경로는 이 저장소의 `xdr/alerts.log`이며, 실제 ZTNA 어댑터를 `ztna.addDenyRule`로 전달해야 합니다. 어댑터는 만료 시각을 실제 판정에 적용해야 합니다.

fixture 재생의 규칙 추가와 정상 주소 통과 여부는 `node --test test/xdr-respond.test.mjs`로 확인합니다. 이는 격리된 가짜 ZTNA 규칙 저장소를 사용한 로컬 시험이며, 실제 운영 판정기 연결이나 배포를 의미하지 않습니다.

## 실행

저장소 루트에서 항목 키 하나를 넣습니다.

```
node scripts/xdr-run.mjs brute-force
```

`npm run xdr:run -- brute-force` 도 같은 명령입니다. 실행기는 해당 경보마다 `decide` 를 부르고, 결과를 `xdr/<moduleKey>/result.json` 에 씁니다. 형식은 `aleph.xdr.result.v1` 이고, `decisions` 에는 경보 id·행동·확신도·이유가, `counts` 에는 `block`·`alert`·`record` 건수가 있습니다.

반환 형식이 틀린 경보는 `record` 로 남고, 오류 한 줄이 출력됩니다. 실행기 자체는 네트워크를 쓰지 않습니다. 판정자는 격리된 환경에서 같은 명령을 다시 실행해 결과를 봅니다. 이미 커밋된 `result.json` 만으로 판정이 끝나지 않습니다.
