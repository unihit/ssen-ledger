# Agent API 배포 체크리스트

이 문서는 **사용자가 직접** Supabase에 적용·배포할 때 쓰는 순서입니다.  
프로젝트: `iglonavoqsihzdobfadh` (`https://iglonavoqsihzdobfadh.supabase.co`)

## 0. 준비

- Supabase Dashboard에 로그인되어 있어야 합니다.
- PowerShell에서 `$HOME\ssen-ledger-app`로 이동합니다.
- `.env.agent`에 `AGENT_API_KEY`, `SUPABASE_PROJECT_REF`, `SUPABASE_URL`이 있습니다. 키는 화면에 출력하지 마세요.

```powershell
Set-Location "$HOME\ssen-ledger-app"
Get-Content .env.agent | Select-String '^AGENT_API_KEY=' # 키 확인용. 출력 캡처/공유 금지
```

## 1. SQL 적용

Supabase Dashboard → SQL Editor에서 아래 파일을 **전체 복사해서 실행**합니다.

1. 새 프로젝트라면 `supabase/schema.sql`
2. 이어서 `supabase/agent-api.sql`

`agent-api.sql`은 여러 번 실행해도 되도록 작성되어 있습니다.

적용 확인:

```sql
select count(*) as categories from public.ledger_categories;
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'transactions'
  and column_name in ('category_major','category_minor','status','effective_amount')
order by column_name;
```

기대값: `categories = 45`, 컬럼 4개.

## 2. Edge Function Secret 설정

Dashboard → Project Settings → Edge Functions → Secrets에서 추가:

| 이름 | 값 |
|---|---|
| `AGENT_API_KEY` | `.env.agent`의 값 |
| `AGENT_HOUSEHOLD_ID` | 가구가 2개 이상일 때만. 1개면 생략 가능 |

`SUPABASE_URL`과 `SUPABASE_SECRET_KEYS`는 Edge Function 런타임에서 자동 제공됩니다. 코드는 `SUPABASE_SECRET_KEYS` JSON의 `default` 키를 사용하고, legacy `SUPABASE_SERVICE_ROLE_KEY`는 fallback으로만 남겨 둡니다.

CLI로 넣으려면 `npx --yes supabase@latest login` 후:

```powershell
$key = (Get-Content .env.agent | Select-String '^AGENT_API_KEY=').Line.Split('=', 2)[1]
npx --yes supabase@latest secrets set "AGENT_API_KEY=$key" --project-ref iglonavoqsihzdobfadh
```

## 3. 배포

```powershell
npx --yes supabase@latest login
npx --yes supabase@latest functions deploy agent-api --no-verify-jwt --project-ref iglonavoqsihzdobfadh
```

`supabase/config.toml`에 `verify_jwt = false`가 있어 `--no-verify-jwt`를 생략해도 됩니다.  
배포가 끝나면 함수 URL은 다음과 같습니다.

```text
https://iglonavoqsihzdobfadh.supabase.co/functions/v1/agent-api
```

## 4. 배포 확인

```powershell
curl.exe https://iglonavoqsihzdobfadh.supabase.co/functions/v1/agent-api/v1/health
```

기대 응답:

```json
{"ok":true,"service":"ssen-ledger-agent-api","version":"1.0","time":"..."}
```

인증 확인:

```powershell
$key = (Get-Content .env.agent | Select-String '^AGENT_API_KEY=').Line.Split('=', 2)[1]
curl.exe "https://iglonavoqsihzdobfadh.supabase.co/functions/v1/agent-api/v1/meta" `
  -H "Authorization: Bearer $key"
```

`401 UNAUTHORIZED`가 나오면 Secret의 키와 보낸 키가 같은지 확인합니다.

## 5. 가구 UUID 확인

앱에서 로그인/가구 생성을 한 번 한 뒤 SQL Editor에서:

```sql
select id, name, created_at
from public.households
order by created_at;
```

- 1개면 `AGENT_HOUSEHOLD_ID`를 생략해도 됩니다.
- 2개 이상이면 하나를 골라 Secret에 넣고 재배포합니다.

```powershell
npx --yes supabase@latest secrets set "AGENT_HOUSEHOLD_ID=<가구 UUID>" --project-ref iglonavoqsihzdobfadh
```

## 6. 시트 거래 이관

실제 거래 데이터(금액·메모·사용처)는 저장소에 커밋하지 마세요. 로컬의 비공개 파일이나 일회성 스크립트로 API에 입력하고, 이관 후에는 해당 파일을 저장소 밖으로 옮기거나 삭제합니다.

```powershell
$env:AGENT_API_URL = "https://iglonavoqsihzdobfadh.supabase.co/functions/v1/agent-api"
$env:AGENT_API_KEY = (Get-Content .env.agent | Select-String '^AGENT_API_KEY=').Line.Split('=', 2)[1]
# 로컬의 비공개 이관 스크립트 실행
```

이미 입력된 거래를 같은 고정 UUID로 다시 보내면 `409`로 건너뜁니다.

기존 앱 데이터와 시트 데이터가 같은 월에 겹치면, 시트 기준으로 맞추기 위해 아래 SQL을 **필요한 경우에만** 실행합니다. 하드 삭제가 아니라 소프트 취소이며 `ledger_history`에 기록됩니다.

```powershell
npx --yes supabase@latest db query --linked --project-ref iglonavoqsihzdobfadh `
  --file supabase/cleanup-2026-10-app-data.sql
```

- 대상: 2026-10-01~31, `source = 'app'`, `status = 'active'`
- 기대: `canceled_count`가 기존 10월 앱 거래 수와 같음
- 가구가 2개 이상이면 SQL의 가구 선택 부분을 실제 UUID로 바꿔야 합니다.

이관 후 검증:

```powershell
curl.exe "https://iglonavoqsihzdobfadh.supabase.co/functions/v1/agent-api/v1/aggregates/monthly?month=2026-10" `
  -H "Authorization: Bearer $env:AGENT_API_KEY"
```

응답의 `livingExpense`, `investmentContribution`, `principalRepayment`, `distributionBalance`, `transactionCount`가 시트의 해당 월 값과 일치하는지 확인합니다. 실제 금액은 이 문서에 기록하지 않습니다.

## 7. Muse 설정

Muse의 서버 측 Secret/환경변수에 아래 두 개를 넣습니다.

```text
AGENT_API_URL=https://iglonavoqsihzdobfadh.supabase.co/functions/v1/agent-api
AGENT_API_KEY=<.env.agent의 AGENT_API_KEY>
```

Muse가 호출할 때는 모든 데이터 요청에 다음 헤더를 붙입니다.

```http
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json
```

## 8. 문제 해결

| 증상 | 확인 |
|---|---|
| `401 UNAUTHORIZED` | Secret `AGENT_API_KEY`와 요청 헤더가 같은지 |
| `CONFIG_ERROR` | `AGENT_HOUSEHOLD_ID`가 실제 가구 UUID인지, 가구가 1개인지 |
| `DB_ERROR` + `permission denied for table` | `agent-api.sql`의 `service_role` GRANT를 적용했는지. SQL Editor에서 다시 실행 |
| `500` | Supabase Dashboard → Edge Functions → `agent-api` → Logs |
| `404` | URL이 `/functions/v1/agent-api/v1/...`인지 |
| CORS | API가 `OPTIONS`와 `access-control-*`를 반환하는지 |
| 함수가 Supabase JWT를 요구 | `verify_jwt = false` 또는 `--no-verify-jwt`로 배포했는지 |

## 9. 보안

- `SUPABASE_SECRET_KEYS`(자동 제공)와 legacy `SUPABASE_SERVICE_ROLE_KEY`는 Edge Function 런타임에만 존재합니다.
- `AGENT_API_KEY`를 프런트엔드, GitHub, Muse의 공개 설정에 넣지 않습니다.
- 키가 유출되면 Supabase Secret에서 교체하고 Muse에도 새 키를 넣습니다.
