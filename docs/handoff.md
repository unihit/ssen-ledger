# 쎈 가계부 — 다른 PC 작업 인계 문서

기준일: **2026-10-23**

최신 기능: **저축 카테고리·고정지출·저축 템플릿·확인 후 반영·Agent API·Datadog 개인정보 마스킹**

현재 저장소 상태: **clean**

> 이 문서는 **공개 저장소에 올려도 되는 기술/운영 컨텍스트**만 담고 있습니다.
> 실제 거래 금액, 가구 UUID, 잔액, 환경변수 값, API 키는 이 문서에 넣지 않았습니다.
> 민감한 현재 데이터 스냅샷은 저장소 밖 또는 `.private/`에 별도로 보관하세요.

---

## 1. 프로젝트 개요

- **이름**: 쎈 가계부
- **목적**: 실제 보유 카드 5장을 기준으로 카드 실적·혜택을 계산하고, 결제 전에 유리한 카드를 추천
- **기술 스택**
  - React 19 + TypeScript
  - Vite 5
  - Supabase Postgres + Auth + RLS + Realtime
  - 외부 UI/차트 라이브러리 없이 CSS/SVG 사용
- **운영 원칙**
  - 실제 은행·카드사 연동 없음. **수동 입력만** 사용
  - 실제 거래 데이터와 비밀키는 GitHub에 커밋하지 않음
  - 거래는 **하드 삭제하지 않음**. `canceled` 상태와 `ledger_history`로 이력 보존
  - Supabase Auth/RLS/Realtime 구조 유지
  - UI와 답변은 한국어

### 링크

- 저장소: <https://github.com/unihit/ssen-ledger>
- 배포 사이트: <https://unihit.github.io/ssen-ledger/>
- Supabase 프로젝트 ref: `iglonavoqsihzdobfadh`
- Agent API: `https://iglonavoqsihzdobfadh.supabase.co/functions/v1/agent-api`

---

## 2. 새 PC 세팅

### 권장 경로

한글 경로에서 Node 22 + esbuild 충돌이 날 수 있으므로 **영문 경로**를 사용합니다.

```powershell
Set-Location $HOME
git clone https://github.com/unihit/ssen-ledger.git ssen-ledger-app
Set-Location .\ssen-ledger-app
npm install --ignore-scripts
npm run dev
```

브라우저: <http://localhost:5173/>

또는 저장소의 `start.cmd`를 더블클릭해도 됩니다.

### 확인된 환경

- Node `v22.11.0`
- npm `10.9.0`
- Supabase CLI `2.121.0`
- Git `2.49.0`

### 새 PC에서 하지 말 것

- **JSON 가져오기**로 클라우드 데이터를 덮어쓰지 말 것
- **초기 상태로 되돌리기**를 하지 말 것
- 클라우드가 비어 보이면 바로 업로드하지 말고, 같은 Supabase 계정으로 로그인했는지 확인
- `git clean -fdx`를 실행하지 말 것 (`.env.local`, `.env.agent`가 삭제됨)

---

## 3. 환경변수와 비밀값

`.env.local`과 `.env.agent`는 `.gitignore`에 의해 제외되어 있습니다.
GitHub에 없으므로 새 PC로 **USB/비밀번호 관리자 같은 안전한 방법**으로 옮기세요.
채팅, 메신저, 공개 저장소에 값을 붙여넣지 마세요.

### `.env.local`

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_DATADOG_ENABLED=true
VITE_DATADOG_APPLICATION_ID=
VITE_DATADOG_CLIENT_TOKEN=
VITE_DATADOG_SITE=datadoghq.com
VITE_DATADOG_SERVICE=ssen-ledger
VITE_DATADOG_ENV=development
VITE_DATADOG_VERSION=1.0.0
VITE_DATADOG_REPLAY_SAMPLE_RATE=0
```

- `VITE_SUPABASE_ANON_KEY`는 공개되어도 되는 anon key이지만 저장소에는 커밋하지 않습니다.
- 실제 접근 제어는 Supabase RLS가 담당합니다.
- `service_role` 또는 `sb_secret_...` 키는 **절대 프런트엔드에 넣지 않습니다.**

### `.env.agent`

```env
AGENT_API_KEY=
AGENT_HOUSEHOLD_ID=
SUPABASE_PROJECT_REF=iglonavoqsihzdobfadh
SUPABASE_URL=https://iglonavoqsihzdobfadh.supabase.co
```

- `AGENT_API_KEY`는 Muse/Agent API 인증용 단일 키입니다.
- 현재 가구가 1개라 `AGENT_HOUSEHOLD_ID`는 생략 가능하지만, 기존 파일에 값이 있으면 그대로 옮깁니다.
- 키를 잃어버리면 Supabase Edge Function Secrets에서 새로 발급하고 Muse 설정도 갱신해야 합니다.

GitHub Actions Secrets에는 이미 아래 값들이 설정되어 있습니다.

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_DATADOG_APPLICATION_ID
VITE_DATADOG_CLIENT_TOKEN
VITE_DATADOG_SITE
VITE_DATADOG_SERVICE
```

Datadog 개인정보 보호 설정:

- `VITE_DATADOG_ENABLED=false`이면 RUM/Logs를 완전히 끕니다. GitHub Actions에서는 Repository variable `VITE_DATADOG_ENABLED`로 제어합니다.
- `VITE_DATADOG_REPLAY_SAMPLE_RATE`는 기본 `0`이라 세션 리플레이(화면 녹화)를 수집하지 않습니다.
- RUM/Logs 전송 전에 화면 텍스트·입력값·클릭 대상·URL 쿼리/해시·이메일·UUID·긴 숫자를 마스킹합니다.
- 로그인 사용자는 원본 Supabase UUID/이메일 대신 SHA-256 앞 8바이트 익명 해시만 전송합니다.
- `VITE_DATADOG_APPLICATION_ID`와 `VITE_DATADOG_CLIENT_TOKEN`은 브라우저에 노출되는 공개 식별자입니다. `service_role` 키나 `AGENT_API_KEY`와 혼동하지 마세요.

---

## 4. 현재 데이터 상태

> 실제 금액과 가구 UUID는 공개 문서에 기록하지 않습니다. 아래는 운영상 알아야 할 사실만 정리한 것입니다.

- 가구 1개, 활성 카드 5장
- 카드 ID
  - `mg-plus-s-hana` — MG+ S 하나카드
  - `kb-nara-check` — KB국민 나라사랑체크카드
  - `kb-toktok-my-point` — KB국민 톡톡 my point 카드
  - `mg-honey-check` — 꿀카드
  - `woori-skt` — SKT 우리카드
- 취소된 거래가 다수 존재합니다. 이는 의도된 소프트 삭제 이력이므로 **물리 삭제하지 않습니다.**
- 9월 실적 조건을 맞추기 위한 **실적 채움용 거래**가 Supabase에만 존재합니다.
  - 저장소의 seed 데이터에는 없습니다.
  - 삭제하지 마세요.
- `2026-10` 월말 잔액 스냅샷은 아직 **테스트/플레이스홀더 값**입니다.
  - 월말에 실제 6개 값으로 교체해야 합니다.
  - 컬럼: `cash_account`, `securities_krw`, `foreign_cash_krw`, `overdraft_used`, `family_loan`, `other_loan`
- 기존 간편결제 거래 1건은 `paymentMethod: '간편결제'`로 저장되어 있습니다.
  - 분류는 `교통`으로 유지합니다.
  - 만원 미만 건을 `신용카드`로 바꾸지 마세요.

현재 가구 UUID와 실제 거래 값은 다음 중 하나로 확인합니다.

```powershell
npx --yes supabase@latest db query --linked "select id, name from public.households;"
```

또는 인증된 Agent API:

```powershell
curl.exe "https://iglonavoqsihzdobfadh.supabase.co/functions/v1/agent-api/v1/meta" `
  -H "Authorization: Bearer <AGENT_API_KEY>"
```

---

## 5. 카드별 현재 설정

### MG+ S 하나카드 (`mg-plus-s-hana`)

- 전월 실적 기준: `300,000원`
- 실적 구간별 통합 한도
  - 30만원 → 15,000원
  - 60만원 → 30,000원
  - 100만원 → 60,000원
- 기본 적립: 0%
- 간편결제
  - 10%
  - 월 한도 60,000원
  - **건당 10,000원 이상**
  - `paymentMethods: ['간편결제']`
- 구독
  - 50%
  - 월 한도 60,000원
- **간편결제 10%는 결제수단 기준**입니다.
  - 카카오T처럼 카테고리가 `교통`이어도 `paymentMethod: '간편결제'`면 적용됩니다.
- 만원 미만 간편결제는 혜택만 0원이고, 결제수단은 `간편결제`로 유지합니다.

### KB국민 나라사랑체크카드 (`kb-nara-check`)

- 전월 실적 기준: `100,000원`
- 구간별 통합 한도: 10만/20만/30만/50만/100만 → 5천/1만/2만/3만/5만
- 교통 20%, 카페 20%, 문화 35%, 쇼핑 5%, 음식 20%
- 통신 5%, **건당 50,000원 이상**
- 기본 적립 0%

### KB국민 톡톡 my point 카드 (`kb-toktok-my-point`)

- 전월 실적 기준 없음
- 기본 적립: **5.5%**
- 기본 적립 한도: **11,000원**
- 월 통합 한도: **11,000원**
- 간편결제 5.5%, 월 한도 11,000원
- 해석: **5.5%가 적용되는 대상 결제액은 200,000원까지**, 최대 혜택 11,000원
  - 200,000원 한도는 혜택 지급액 상한이 아니라 혜택 대상 결제액 기준으로 본 상태입니다.

### 꿀카드 (`mg-honey-check`)

- 전월 실적 기준: `100,000원`
- 쇼핑 10%, 월 2,900원, 10만원 실적
- 구독 10%, 월 2,000원, 20만원 실적, 건당 10,000원 이상
- 간편결제 10%, 월 10,000원, 30만원 실적, 건당 10,000원 이상
- 기본 적립 0%

### SKT 우리카드 (`woori-skt`)

- 전월 실적 기준: `300,000원`
- 구간별 통합 한도: 30만/70만/100만 → 1만/1.5만/2만
- 통신 36%, 문화 20% (건당 12,000원 이상), 음식 10%, 카페 20%
- 기본 적립 0%

---

## 6. 혜택 계산 로직

핵심 파일: `src/lib/benefits.ts`

- `computeCardMonth()`
  - 전월 실적 확인
  - 전월 실적 구간에 맞는 이번 달 통합 한도 선택
  - 이번 달 거래에 혜택 규칙 적용
- 규칙 매칭 우선순위
  1. **카테고리 혜택**
  2. 카테고리 혜택이 없으면 **결제수단 혜택**
- 같은 거래가 두 규칙에 중복 계산되지 않도록 거래 1건은 규칙 1개에만 배정
- `minTransactionAmount` 미만 거래
  - 혜택 계산에서는 제외
  - 카드 실적/이번 달 결제 금액에는 포함
- 기본 적립은 혜택 규칙에 잡힌 거래를 제외하고 계산
- `benefitRuleForTransaction()`는 화면에서 거래별 혜택 조건을 표시할 때 사용

### 최근 UI 변경

- 카드 상세 혜택 목록에 `건당 1만원 이상` 조건 표시
- 가계부 거래 목록에서 만원 미만 간편결제 건에 `혜택 제외 · 1만원 미만` 배지 표시

**중요:** 만원 미만 간편결제를 `신용카드`로 바꾸지 마세요.
실제 결제수단은 `간편결제`로 두고, 금액 조건은 `minTransactionAmount`가 처리하게 해야 합니다.

---

## 6-1. 고정지출·저축

고정지출은 `recurring_expenses`에 **템플릿**으로 저장합니다. 템플릿 자체는 실제 거래가 아니므로 반영 전에는 지출·카드 실적에 잡히지 않습니다.

- 앱 화면
  - `설정` → 고정지출·저축 관리: 템플릿 등록·수정·숨기기
  - `가계부` → 이번 달 고정지출·저축: `예정`/`반영 후보`/`기록됨` 상태와 반영 버튼
  - `홈` → 이번 달 고정지출·저축 요약
- 반영 흐름
  1. 템플릿의 이름·금액·반영일·카테고리·카드로 `TransactionModal`을 미리 채웁니다.
  2. 사용자가 내용을 확인하고 저장해야 실제 `transactions` 행이 생성됩니다.
  3. 생성된 거래에는 `fixed_expense_id`와 `fixed_expense_month`가 연결됩니다.
  4. 같은 달에 중복 반영되지 않도록 활성 거래에 부분 unique index가 걸려 있습니다.
  5. 반영 시 같은 달의 활성 거래가 이미 있으면 새 행을 만들지 않고 그 거래를 갱신합니다. 저장 후 클라우드 상태를 다시 읽어 버튼·목록을 맞춥니다.
  6. `기록됨` 판정은 `fixed_expense_id`+`fixed_expense_month` 연결만 기준으로 합니다. 같은 날짜·금액이어도 연결되지 않은 거래는 자동으로 매칭하지 않고 **후보**로 보여준 뒤 사용자가 `이 거래 연결`을 눌러야 연결합니다.
  7. 반영은 기존 거래를 조용히 취소하지 않습니다. 새 거래를 만들거나, 사용자가 고른 후보 거래에 `fixed_expense_id`/`fixed_expense_month`만 붙입니다. 같은 날짜·금액 후보가 있으면 `기존 거래에 연결`이 기본으로 선택됩니다. 그래도 `새 거래로 반영`을 고르면, 기존 거래가 지출에 그대로 남아 두 번 잡힌다는 경고를 한 번 더 확인해야 합니다.
  8. Realtime은 `transactions`, `cards`, `households`, `recurring_expenses`를 구독합니다. 다른 탭에서 반영하거나 템플릿을 수정해도 자동으로 다시 읽습니다.
- `결제수단`이 `자동이체`·`계좌이체`·`현금`이면 카드 입력란을 표시하지 않고 카드 실적·혜택 계산에서도 제외합니다. 카드 결제수단을 고른 경우에만 카드를 선택합니다.
- 일반 내역 입력 시 같은 날짜·분류·금액의 활성 거래가 이미 있으면 저장 전에 `이미 있는 거래예요` 경고를 띄우고, 사용자가 `그래도 저장`을 눌러야 저장합니다.
- 샘플/시드 거래는 `transactions.source = 'seed'`로 저장하고 가계부 목록에 `테스트` 배지를 표시합니다. 실데이터와 섞이지 않도록 초기 입력·데모 데이터에만 사용합니다. 앱에서 시드 거래를 취소해도 `source` 표식은 `seed`로 유지하고 `cancel_reason`·`ledger_history`만 남깁니다.
- 배포가 바뀐 뒤 이미 열려 있던 탭은 새로고침 전까지 이전 번들의 판정 로직을 계속 실행합니다. 탭으로 돌아올 때 새 번들을 확인하고, 다르면 `새 버전이 나왔어요` 배너로 새로고침을 안내합니다.
- `day_of_month = 31`은 **말일**입니다. 2월은 28/29일, 30일까지 있는 달은 30일로 계산합니다.
- 보험료처럼 실제 결제일이 달라지는 항목은 반영 시 날짜를 바꿀 수 있고, Agent API의 `apply`에 `date`를 보내 기존 거래 날짜를 수정할 수 있습니다.
- 고정지출 숨기기는 `active = false` 소프트 삭제입니다. 이미 반영된 거래는 취소·삭제하지 않습니다.
- `recurring_expenses` 변경은 `ledger_history`에 `entity_type = 'recurring_expense'`로 기록됩니다.
- `투자납입`으로 분류한 고정지출(IRP·연금 등)은 생활비 지출이 아니라 **저축**으로 표시합니다. 홈의 저축 목표는 총 저축 가능액(`수입 - 생활비`)을 유지하면서 `현금 저축`과 `고정 저축`으로 나눠 보여줍니다. IRP 반영액을 총액에 다시 더하지 않으므로 이중계산이 없습니다.
- 일반 `저축` 카테고리 내역도 추가할 수 있습니다. 저축 내역은 `category_id = 'savings'`, `category_major/group = '투자납입'`, `category_minor = '예적금'`, `excluded = true`, `card_id = null`로 저장되며 생활비 지출·카드 실적·혜택에서 제외됩니다. 홈에서는 `저축 기록`으로 표시하고, 가계부 합계에서는 지출과 분리합니다.

현재 일곱 개 템플릿이 Supabase에 입력되어 있습니다. 실제 금액·가구 UUID는 이 공개 문서에 기록하지 않습니다. 결제 카드가 연결되지 않은 항목은 `자동이체`/현금·계좌로 설정되어 있으므로, 실제 카드 결제 항목은 설정 화면에서 카드를 지정해야 카드 혜택이 계산됩니다.

---

## 7. Muse / Agent API

- 위치: `supabase/functions/agent-api/index.ts`
- 인증: `Authorization: Bearer <AGENT_API_KEY>`
- `verify_jwt = false`
- 문서: `docs/agent-api.md`
- 배포 체크리스트: `docs/deploy-agent-api.md`

### 주요 엔드포인트

- `GET /v1/health`
- `GET /v1/meta`
- `GET /v1/cards`
- `POST /v1/transactions`
- `PATCH /v1/transactions/:id`
- 취소/복구
- `GET /v1/aggregates/monthly`
- `GET /v1/balance-snapshots`
- `GET/PUT /v1/balance-snapshots/:month`
- `GET/POST /v1/fixed-expenses`
- `GET/PATCH/DELETE /v1/fixed-expenses/:id`
- `POST /v1/fixed-expenses/:id/apply` — 실제 거래 생성/날짜 수정
- `GET /v1/fixed-expenses/:id/history`

### 허용 결제수단

```text
계좌이체
신용카드
체크카드
간편결제
현금
자동이체
기타
컬쳐랜드 문화상품권
```

`카카오T 간편결제`, `카카오페이`, `네이버페이`, `토스페이`, `SSG페이`, `11pay`, `스마일페이`, `삼성페이`, `애플페이`, `구글페이` 등은 서버에서 `간편결제`로 정규화합니다.

### Muse 거래 예시

```json
{
  "date": "2026-10-23",
  "merchant": "카카오T",
  "categoryMajor": "생활비",
  "categoryMinor": "교통",
  "amount": 15000,
  "paymentMethod": "간편결제",
  "cardName": "MG+ S 하나카드",
  "memo": "택시비",
  "note": "카카오T 간편결제"
}
```

- `cardName`을 보내면 서버가 카드 ID로 자동 변환합니다.
- 새 카드가 추가되어도 `GET /v1/cards` 기준으로 자동 연결됩니다.
- 거래는 하드 삭제하지 않고 취소/복구 + `ledger_history`를 사용합니다.

### API 코드를 수정했을 때 배포

```powershell
npx --yes supabase@latest login
npx --yes supabase@latest link --project-ref iglonavoqsihzdobfadh
npx --yes supabase@latest functions deploy agent-api --no-verify-jwt
```

확인:

```powershell
curl.exe https://iglonavoqsihzdobfadh.supabase.co/functions/v1/agent-api/v1/health
```

---

## 8. 최근 커밋 이력

```text
34315eb Document loan-principal cleanup and savings category mismatch
b67b879 Keep insurance as a manual entry, not a fixed expense
25eca9b Match fixed expenses by id and month and warn on duplicates
ca662a6 Subscribe realtime to recurring expenses and mirror cloud visibility
9616dd9 Keep fixed expense marked recorded when transaction is off-screen
b088e29 Reuse existing fixed expense transaction when applying
d7f8c5a Show minimum transaction benefit conditions
```

- `b088e29`: 반영 시 같은 달의 기존 활성 거래를 재사용해 중복 insert를 막음
- `9616dd9`: 대출상환처럼 생활비 목록 밖에 있는 거래도 `기록됨`으로 유지
- `25eca9b`: `fixed_expense_id`+`fixed_expense_month` 엄격 매칭, 후보 연결, 수동 입력 중복 경고
- `34315eb`: 대출원금 중복 정리와 IRP 분류 한계 문서화
- 이후 커밋: 새 버전 감지 배너 추가, 취소 시 시드 출처(`source = 'seed'`) 유지

---

## 9. 남은 일 / 알려진 한계

1. **2026-10 월말 잔액 스냅샷 실제 값 입력**
   - 현재는 테스트/플레이스홀더 값
2. **수동 입력 모달에는 결제수단 선택 UI가 없음**
   - 현재는 기존 거래의 `paymentMethod`를 보존하는 수준
   - 수동으로도 `간편결제`를 고르게 하려면 `TransactionModal.tsx`에 결제수단 필드 추가 필요
   - Muse/API로 입력하면 정상 저장됨
3. **앱 삭제는 소프트 취소**
   - `deleteTransaction`도 실제 DELETE가 아니라 `status = 'canceled'`
4. **Supabase CLI 병렬 쿼리 주의**
   - `cli_login_postgres` 인증 오류가 간헐적으로 발생할 수 있음
   - DB 쿼리는 한 번에 하나씩 실행하는 게 안전함
5. **고정지출 결제 카드 연결**
   - 현재 활성 템플릿은 여섯 개이며, 카드가 연결된 항목은 구글 제미나이 프로(`신용카드`)와 로켓와우(`체크카드`)이고 나머지는 `자동이체`/카드 없음
   - 보험료는 고정지출 템플릿이 아니라 직접 입력하는 항목이라 비활성으로 둡니다. 필요하면 설정에서 다시 켤 수 있습니다.
   - 실제 카드 결제 항목은 설정에서 카드를 지정해야 카드 실적·혜택에 반영됨
6. **저축 세부 분류가 모두 `예적금`으로 정규화됨**
   - 저축 카테고리 거래는 `SAVINGS_SHEET` 기준으로 `투자납입/예적금/투자납입`을 저장합니다.
   - 그래서 IRP 납입도 시트 분류가 `예적금`으로 찍힙니다. 정의상 `IRP·연금`과 다르므로, 분류 체계를 세분화할 때 `SAVINGS_SHEET`와 고정지출 반영 로직을 함께 수정해야 합니다.

---

## 10. 자주 쓰는 명령

```powershell
# 개발
npm run dev

# 타입 검사 + 프로덕션 빌드
npm run build

# Git 상태 / 최근 커밋
git status --short
git log -5 --oneline

# 배포
git add .
git commit -m "변경 내용"
git push origin main

# GitHub Pages 배포 확인
gh run list --branch main --limit 1
gh run watch <RUN_ID> --exit-status
```

---

## 11. 새 PC/새 에이전트에게 전달할 한 줄 요약

> 이 프로젝트는 React 19 + TypeScript + Vite + Supabase로 만든 한국어 개인 가계부다.
> 실제 데이터는 Supabase에 있고 GitHub에는 코드만 올린다.
> 최신 기능 커밋은 `d7f8c5a`이며, MG+ S 하나카드의 간편결제 10%는
> `paymentMethods: ['간편결제']`와 `minTransactionAmount: 10000`으로 처리한다.
> 거래는 하드 삭제하지 말고 `canceled`와 `ledger_history`를 사용해야 한다.
> 새 PC에서는 `.env.local`/`.env.agent`를 안전하게 옮기고,
> 같은 Supabase 계정으로 로그인한 뒤 JSON 가져오기나 초기화를 하지 말아야 한다.
