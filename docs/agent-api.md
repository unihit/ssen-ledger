# Muse / Agent REST API

Muse 같은 클라우드 에이전트가 **단일 Bearer API 키**로 가계부를 읽고 쓰기 위한 Supabase Edge Function입니다.

- 공개 HTTPS 주소: `https://<PROJECT_REF>.supabase.co/functions/v1/agent-api`
  - 이 작업 공간의 프로젝트: `https://iglonavoqsihzdobfadh.supabase.co/functions/v1/agent-api`
- 인증: `Authorization: Bearer <AGENT_API_KEY>` (키 1개)
- 데이터 저장소: 기존 Supabase 프로젝트의 `public.transactions` 확장 + `balance_snapshots`, `recurring_expenses`, `ledger_categories`, `ledger_history`
- 새 secret key(`sb_secret_...`) 또는 legacy `service_role` 키는 Edge Function Secret에만 두고 앱/프런트엔드/Muse에 절대 노출하지 않습니다.
- 직접 배포 순서는 [`docs/deploy-agent-api.md`](deploy-agent-api.md)를 참고하세요.

## 1. 적용 순서

### 1-1. 기존 스키마

Supabase Dashboard → SQL Editor에서 `supabase/schema.sql`을 먼저 실행합니다.  
이미 앱을 사용 중이라면 실행하지 않아도 됩니다.

### 1-2. API용 스키마

같은 SQL Editor에서 `supabase/agent-api.sql` 전체를 실행합니다.

이 파일이 하는 일:

- `transactions`에 시트 호환 컬럼 추가
  - `category_major` (거래유형: 수입/생활비/투자납입/…)
  - `category_minor` (분류: 급여/주거/마트/…)
  - `category_group` (집계 위치: 수입/생활비/…/집계 제외)
  - `correction` (보정), `effective_amount` (금액+보정, generated)
  - `payment_method`, `note`
  - `status` (`active`/`canceled`), `canceled_at`, `cancel_reason`
  - `source`, `created_by`, `updated_by`
- 기존 거래를 `생활비`/앱 카테고리 기준으로 백필
- `ledger_categories` 45개 분류 시드
- `balance_snapshots` (잔액관리 B~G)
- `recurring_expenses` (반복거래/고정지출)
- `ledger_history` (거래·잔액 변경 이력)
- 거래/잔액 변경 시 자동 이력 트리거
- 기존 `replace_household_state` RPC를 **하드 삭제 대신 소프트 취소** 방식으로 변경
- RLS/권한 설정

### 1-3. Edge Function Secret

Supabase Dashboard → Project Settings → Edge Functions → Secrets에서 다음을 추가합니다.

| 이름 | 필수 | 설명 |
|---|---|---|
| `AGENT_API_KEY` | 필수 | Muse가 보낼 긴 랜덤 문자열 |
| `AGENT_HOUSEHOLD_ID` | 선택 | 가구 UUID. 가구가 1개면 생략 가능 |

`SUPABASE_URL`과 `SUPABASE_SECRET_KEYS`는 Supabase Edge Function 런타임에서 자동 제공됩니다. 코드는 `SUPABASE_SECRET_KEYS` JSON의 `default` 키를 사용하고, legacy `SUPABASE_SERVICE_ROLE_KEY`는 fallback입니다.

API 키 생성 예시(PowerShell):

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

이 작업 공간에는 이미 `.env.agent`에 `AGENT_API_KEY`, `SUPABASE_PROJECT_REF`, `SUPABASE_URL`이 들어 있습니다. 키를 화면에 출력하지 말고 Secret 설정에만 사용하세요.

CLI로 Secret을 넣으려면:

```powershell
$env:SUPABASE_ACCESS_TOKEN = Get-Content .supabase-token -Raw
npx --yes supabase@latest secrets set AGENT_API_KEY="<.env.agent의 AGENT_API_KEY>" --project-ref <PROJECT_REF>
```

### 1-4. 배포

```powershell
npx --yes supabase@latest login
npx --yes supabase@latest functions deploy agent-api --no-verify-jwt --project-ref <PROJECT_REF>
```

`supabase/config.toml`에 `verify_jwt = false`가 들어 있어 `--no-verify-jwt`를 생략해도 됩니다. 이 플래그는 Supabase JWT 대신 **우리 Bearer API 키**로 인증하기 위해 필요합니다.

가구가 2개 이상이면 `AGENT_HOUSEHOLD_ID`도 설정합니다. SQL Editor에서 확인:

```sql
select id, name, created_at from public.households order by created_at;
```

```powershell
npx --yes supabase@latest secrets set AGENT_HOUSEHOLD_ID="<가구 UUID>" --project-ref <PROJECT_REF>
```

배포 후 확인:

```powershell
curl.exe https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/health
```

```json
{"ok":true,"service":"ssen-ledger-agent-api","version":"1.0","time":"..."}
```

## 2. 공통 응답 형식

성공:

```json
{ "data": { } }
```

목록:

```json
{
  "data": [],
  "pagination": { "limit": 100, "offset": 0, "total": 10, "hasMore": false }
}
```

검증 실패:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값을 확인해 주세요.",
    "fields": {
      "date": "YYYY-MM-DD 형식이어야 합니다.",
      "amount": "정수여야 합니다."
    }
  }
}
```

인증 실패는 `401 UNAUTHORIZED`, 없는 리소스는 `404 NOT_FOUND`, 중복 ID는 `409 CONFLICT`입니다.

## 3. 거래(Transaction)

### 필드

| API 필드 | 시트 열 | 설명 |
|---|---|---|
| `id` | — | 고정 UUID. POST 시 생략하면 서버가 생성 |
| `date` | A | `YYYY-MM-DD` |
| `categoryMajor` | B | 거래유형. `type` 별칭 허용 |
| `categoryMinor` | C | 분류. `category`에 `대분류-소분류`로 한 번에 보내도 됨 |
| `amount` | D | 금액(원), 0 이상 정수 |
| `correction` | E | 보정(원), 정수. 기본 0 |
| `effectiveAmount` | F | 응답 전용. `amount + correction` |
| `merchant` | G | 사용처·계좌. `payee` 별칭 허용 |
| `memo` | H | 내용. `description` 별칭 허용 |
| `paymentMethod` | I | 결제수단 |
| `cardId` | — | 해당 가구의 카드 ID. `cardName` 별칭 허용 |
| `note` | J | 비고 |
| `status` | — | `active` / `canceled` |
| `inputStatus` | K | 응답 전용. 현재는 `정상` |
| `reviewAlerts` | L | `검토: 미래 날짜`, `검토: 중복 후보` 배열 |

`cardName`에 카드 이름을 넣으면 서버가 해당 가구의 카드 ID로 자동 변환합니다. `cardId`에 카드 이름을 넣어도 됩니다.

### 카드 목록

```bash
curl "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/cards" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

```json
{
  "data": [
    {
      "id": "mg-plus-s-hana",
      "name": "MG+ S 하나카드",
      "issuer": "하나카드 · MG새마을금고",
      "kind": "credit",
      "active": true
    }
  ]
}
```

카드 이름은 띄어쓰기·기호를 무시하고 비교하며, 정확히 일치하지 않아도 한 카드로만 식별되면 연결됩니다. 여러 카드와 겹치면 `400 VALIDATION_ERROR`와 후보 이름을 반환합니다.

### 생성

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/transactions" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-10-29",
    "categoryMajor": "생활비",
    "categoryMinor": "마트",
    "amount": 12900,
    "correction": 0,
    "merchant": "쿠팡",
    "memo": "생수 2박스",
    "paymentMethod": "신용카드",
    "cardName": "MG+S 하나카드",
    "note": "Muse 입력"
  }'
```

`id`를 직접 지정할 때:

```json
{ "id": "6f1c2d3e-4a5b-4c6d-8e9f-0123456789ab", "...": "..." }
```

같은 `id`가 이미 있으면 `409`입니다.

### 목록/검색

```bash
curl "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/transactions?month=2026-10" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

쿼리 파라미터:

- `month=YYYY-MM`
- `from=YYYY-MM-DD`, `to=YYYY-MM-DD`
- `categoryMajor=생활비` (별칭 `type`)
- `categoryMinor=마트`
- `status=active|canceled`
- `includeCanceled=true`
- `q=검색어` (사용처/내용)
- `limit` (기본 100, 최대 500), `offset`

### 단건 조회/수정

```bash
curl "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/transactions/<ID>" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

```bash
curl -X PATCH "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/transactions/<ID>" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "amount": 13900, "memo": "가격 수정" }'
```

취소된 거래는 PATCH할 수 없습니다. 먼저 복구하세요.

### 취소/복구/이력

하드 삭제는 없습니다. `DELETE`도 소프트 취소로 동작합니다.

```bash
curl -X DELETE "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/transactions/<ID>" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "중복 입력" }'
```

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/transactions/<ID>/cancel" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "중복 입력" }'
```

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/transactions/<ID>/restore" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

```bash
curl "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/transactions/<ID>/history" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

## 4. 월말 잔액 스냅샷

`balance_snapshots`는 시트 `잔액관리`의 B~G를 그대로 저장합니다.

| API 필드 | 시트 | 의미 |
|---|---|---|
| `cashAccount` | B | 통장현금(원) |
| `securitiesKrw` | C | 증권원화예수금 |
| `foreignCashKrw` | D | 외화현금 원화환산 |
| `overdraftUsed` | E | 마통 사용잔액 |
| `familyLoan` | F | 가족차입 잔액 |
| `otherLoan` | G | 기타대출 잔액 |

응답에는 시트 규칙대로 계산한 값이 포함됩니다.

- `cashTotal` = B+C+D (6칸이 모두 숫자일 때만)
- `debtTotal` = E+F+G (6칸이 모두 숫자일 때만)
- `cashDelta`, `debtDelta` = 전월 대비 증감
- `inputStatus` = `미입력` / `잔액 6칸 입력` / `입력완료`

### 저장/수정

```bash
curl -X PUT "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/balance-snapshots/2026-10" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "cashAccount": 1000000,
    "securitiesKrw": 2000000,
    "foreignCashKrw": 0,
    "overdraftUsed": 0,
    "familyLoan": 0,
    "otherLoan": 0,
    "memo": "형식 예시"
  }'
```

`null` 또는 생략은 빈 칸으로 저장됩니다. 6칸 중 일부만 입력하면 `inputStatus`가 `잔액 6칸 입력`이 되고 합계는 `null`입니다.

### 조회

```bash
curl "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/balance-snapshots/2026-10" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

```bash
curl "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/balance-snapshots?from=2026-01&to=2026-12" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

## 5. 월 집계

```bash
curl "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/aggregates/monthly?month=2026-10" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

응답 예시(형식 예시이며 실제 금액이 아닙니다):

```json
{
  "data": {
    "month": "YYYY-MM",
    "income": 1000000,
    "livingExpense": 650000,
    "livingSurplus": 350000,
    "investmentContribution": 150000,
    "investmentWithdrawal": 0,
    "loanBorrowing": 0,
    "principalRepayment": 100000,
    "distributionBalance": 100000,
    "transactionCount": 3,
    "reviewCount": 0,
    "byType": { "수입": 1000000, "생활비": 650000, "투자납입": 150000, "대출상환": 100000, "...": 0 },
    "byCategory": [ { "categoryMajor": "생활비", "categoryMinor": "주거", "categoryGroup": "생활비", "amount": 120000, "count": 1 } ],
    "topExpenses": [],
    "balance": null
  }
}
```

계산 규칙:

- `생활잉여 = 수입 - 생활비`
- `분배후잔액 = 생활잉여 - 투자납입 + 투자회수 + 대출차입 - 원금상환`
- `계좌이체`는 `집계 제외`
- 취소 거래 제외
- 미래 날짜/중복 후보는 **집계에는 포함**하고 `reviewCount`에만 반영 (시트와 동일)

카테고리별 집계만 필요하면:

```bash
curl "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/aggregates/categories?month=2026-10" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

## 6. 고정지출 목록

`recurring_expenses`의 활성 규칙 중 해당 월에 적용되는 항목을 반환합니다.

```bash
curl "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/fixed-expenses?month=2026-10" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

각 항목의 `candidateStatus`:

- `기록됨`: 같은 날짜·분류·금액·사용처·내용의 거래가 이미 있음
- `예정`: 후보일이 오늘(한국 시간) 이후
- `반영 후보`: 후보일이 지났지만 거래가 없음
- `기간·일자 확인`: 시작월/일자가 없음

현재 이 엔드포인트는 **조회 전용**입니다. 반복 규칙 생성/수정은 이후 확장 범위입니다.

## 7. 메타/분류

```bash
curl "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/meta" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

거래유형, 결제수단, 보유 카드 목록, 잔액 B~G 매핑, 45개 분류기준, 사용 가능한 엔드포인트를 반환합니다.

## 7-1. 시트 거래 이관

실제 거래 데이터가 담긴 JSON·스크립트는 저장소에 커밋하지 마세요. 로컬의 비공개 파일로 API에 입력하고, 이관 후에는 `.private/`처럼 Git에서 제외된 경로에 보관하거나 삭제합니다.

```powershell
$env:AGENT_API_URL = "https://<PROJECT_REF>.supabase.co/functions/v1/agent-api"
$env:AGENT_API_KEY = "<AGENT_API_KEY>"
# 로컬의 비공개 이관 스크립트 실행
```

같은 고정 UUID로 다시 보내면 이미 입력된 건은 `409`로 건너뜁니다. 이관 후 `aggregates/monthly` 응답이 시트의 해당 월 합계와 일치하는지 확인합니다.

## 8. 검증 규칙

- `date`: `YYYY-MM-DD`이고 실제 존재하는 날짜
- `amount`: 0 이상 정수 (환불 행은 `amount: 0`, `correction: 음수`)
- `correction`: 정수
- `categoryMajor` + `categoryMinor`: `ledger_categories`에 존재하는 조합
- `paymentMethod`: 아래 중 하나 또는 `null`
  - `계좌이체`, `신용카드`, `체크카드`, `현금`, `자동이체`, `기타`, `컬쳐랜드 문화상품권`
  - 카드 이름을 넣어도 서버가 카드로 인식해 `신용카드`/`체크카드`로 정규화합니다. 가능하면 `cardName`을 사용하세요.
- `merchant` 200자, `memo`/`note` 500자 이하
- `id`: UUID (생략 시 서버 생성)
- `cardId`/`cardName`: 해당 가구의 카드 ID 또는 카드 이름. 이름은 공백·기호를 무시하고 비교하며, 여러 카드와 겹치면 거부

## 9. 보안

- `AGENT_API_KEY`는 길고 무작위한 값 1개만 사용합니다.
- 키는 Muse의 서버 측 Secret에 저장하고, 브라우저/공개 저장소에 넣지 않습니다.
- Edge Function은 `--no-verify-jwt`로 배포하지만, 모든 데이터 엔드포인트는 Bearer 키를 검사합니다.
- `SUPABASE_SECRET_KEYS`(자동 제공)와 legacy `SUPABASE_SERVICE_ROLE_KEY`는 Edge Function 런타임에만 존재합니다.
- RLS는 기존 앱 사용자에게 그대로 적용되고, API는 service role로 동작합니다.
- API 키가 유출되면 Supabase Secret에서 `AGENT_API_KEY`를 교체하고 재배포합니다.

## 10. 참고: 앱과의 관계

앱은 기존처럼 `생활비` 거래만 표시합니다. API에는 수입/투자/대출/계좌이체까지 저장되지만, 앱 화면은 카드 혜택 계산에 필요한 생활비 중심으로 유지됩니다.

앱에서 거래를 삭제해도 실제 행은 지워지지 않고 `status='canceled'`로 남습니다. `ledger_history`에 변경 전/후 JSON이 기록됩니다.

앱의 일반 추가/수정/삭제는 해당 거래만 변경합니다. 앱의 **전체 비우기**와 JSON 가져오기는 앱이 표시하는 `생활비` 거래만 교체하며, API로 들어온 수입·투자·대출·계좌이체 거래는 취소하지 않습니다. API 거래가 참조하는 카드도 앱의 카드 교체 시 함부로 삭제되지 않습니다.

Google Sheet의 현재 데이터를 API로 옮길 때는 실제 거래 데이터를 로컬의 비공개 파일로 준비해 사용합니다. 시트의 `분류기준`은 이미 `ledger_categories`에 시드되어 있습니다. 거래 데이터가 담긴 파일은 저장소에 커밋하지 마세요.

## 11. Muse 카드 연결 규칙

- 사용자가 `MG+S 하나카드`, `꿀카드`처럼 카드 이름을 말하면 `GET /v1/cards`로 목록을 확인하고, 거래의 `cardName`에 카드 이름을 넣습니다. `cardId`나 `paymentMethod`에 이름을 넣어도 서버가 변환합니다.
- 카드 이름이 없으면 `cardId`/`cardName`을 비우고 `paymentMethod`만 보냅니다.
- 현금·계좌이체·자동이체는 카드와 연결하지 않습니다.
- 같은 이름이 여러 카드와 겹치면 API가 후보 목록과 함께 `400`을 반환하므로, 임의로 하나를 고르지 말고 사용자에게 확인합니다.
