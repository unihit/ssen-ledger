# 쎈 가계부

카드 실적과 혜택을 자동으로 계산하고, 결제 전에 가장 유리한 카드를 추천해주는 React 가계부입니다.
실제 카드사·은행 연동 없이 **직접 입력한 내역**과 **실제 보유 카드 정보**로 동작합니다.
Supabase를 연결하면 여러 기기에서 같은 가계부를 동기화할 수 있고, 연결하지 않으면 브라우저에만 저장됩니다.

## 실행 방법

### 가장 쉬운 방법

`start.cmd`를 더블클릭하세요.

- 처음 실행할 때 필요한 패키지를 자동으로 설치합니다.
- 개발 서버가 준비되면 브라우저가 자동으로 열립니다.
- 열리는 검은 명령 창을 닫으면 서버가 종료됩니다.
- 브라우저가 자동으로 열리지 않으면 <http://localhost:5173/> 을 직접 열어주세요.

### 직접 실행

```bat
cd /d "%USERPROFILE%\ssen-ledger-app"
npm install --ignore-scripts
npm run dev
```

> **경로 주의**
> 이 프로젝트의 실제 파일은 `%USERPROFILE%\ssen-ledger-app`(영문 경로)에 두는 것을 권장합니다.
> 한글 경로에서는 Node 22와 esbuild가 충돌할 수 있으므로,
> npm 명령은 영문 경로에서 실행하세요. `start.cmd`가 이 경로로 자동 이동합니다.

## GitHub Pages 배포

- 사이트: <https://unihit.github.io/ssen-ledger/>
- 저장소: <https://github.com/unihit/ssen-ledger>
- 자동 배포: `.github/workflows/deploy-pages.yml` (`main` 브랜치 push 시)
- Vite base: 빌드 시 `/ssen-ledger/`, 개발 서버는 `/`
- GitHub Actions Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DATADOG_*`
- Supabase Auth Site URL: `https://unihit.github.io/ssen-ledger/`

GitHub Pages 무료 플랜은 public 저장소만 지원합니다.
실제 API 키와 `.env.local`은 저장소에 포함하지 않습니다.

## 주요 기능

### 홈
- 이번 달 지출, 예산 사용률, 남은 예산
- 받은 카드 혜택, 저축 가능액(현금+고정 저축), 하루 평균 지출
- 저축 목표 달성률과 카테고리 예산 현황
- 이번 달 고정지출·저축 요약
- 카드별 이번 달 실적·혜택 요약
- **결제 전 알림**: 다음 달 혜택까지 남은 실적, 전월 실적 미달로 꺼진 카드 혜택 안내
- 최근 결제·저축과 카테고리 비중

### 가계부
- 월별 결제·저축 내역 추가·수정·삭제
- 카테고리·결제수단·검색어 필터
- 실적 제외 항목 표시
- 날짜별 그룹, 건수와 합계
- 저축은 지출 합계에서 제외하고 별도 표시
- 고정지출·저축 템플릿을 확인 후 실제 거래로 반영

### 카드
- 카드별 전월 실적, 이번 달 결제, 받은 혜택, 실질 혜택률
- 카테고리별 혜택 사용액과 남은 한도
- 다음 달 혜택 기준까지 남은 금액
- **결제 전 카드 추천**: 카테고리와 금액을 입력하면 카드별 예상 혜택 증가분을 비교
- **카드 등록·수정·삭제**: 이름, 카드사, 신용/체크, 카드 색상, 실적 기준, 혜택 조건을 직접 편집
- **전월 실적 구간별 통합 한도**: 30만원→1.5만원, 60만원→3만원처럼 구간을 직접 추가
- 카드 패널에 구간 기준 실질 혜택률(예: 30만/60만 구간 5%, 100만 구간 6%) 표시
- 카테고리 혜택 추가·삭제, 카드 숨기기/다시 사용
- 결제 내역이 있는 카드는 삭제 대신 숨김을 사용하도록 안내

### 리포트
- 월별 지출 추이(최근 6개월)
- 카테고리 비중 도넛 차트
- 카드 혜택 리포트와 BEST 카드
- 카테고리별 전월 비교
- 예산 페이스·지출 증감 인사이트

### 설정
- 월 수입, 월 지출 예산, 월 저축 목표
- 16개 지출 카테고리별 예산 (간편결제 포함) + 저축 카테고리
- 저축은 예산이 아니라 월 저축 목표로 관리
- 고정지출·저축 템플릿 등록·수정·숨기기
- 계정 이메일과 클라우드 동기화 상태 확인, 로그아웃
- JSON 내보내기/가져오기, CSV 내보내기
- 초기 상태로 되돌리기, 결제·저축 내역 전체 삭제

## 카드 혜택 계산 방식

1. **전월 실적**이 카드의 실적 기준 이상이어야 이번 달 혜택이 적용됩니다.
2. 혜택은 카테고리별 요율로 계산하고, 카테고리별 월 한도와 카드 통합 월 한도를 함께 적용합니다.
3. **전월 실적 구간별 통합 한도**를 설정하면, 전월 실적에 해당하는 구간의 한도를 이번 달 통합 한도로 사용합니다.
4. 카드 추천은 결제 1건을 각 카드에 가상으로 넣어보고 **혜택 증가분**이 가장 큰 카드를 보여줍니다.
5. 실적 제외로 표시한 결제(예: 보험료)는 실적과 혜택 계산에서 빠집니다.
6. 카드 조건은 `카드 → 카드 수정`에서 직접 바꿀 수 있습니다.

> 기본 카드 5종은 실제 보유 카드(MG+ S 하나카드, KB국민 나라사랑체크카드,
> KB국민 톡톡 my point 카드, 꿀카드, SKT 우리카드)를 기준으로 구성했습니다.
> 혜택은 2026-10 기준 공개된 상품 안내를 앱의 카테고리/한도 모델에 맞게 근사한 값이며,
> 가맹점별 고정 할인은 `note`에 실제 조건을 적었습니다. 카드사 사정으로 조건이 달라질 수
> 있으니 실제 적용 조건은 카드사 최신 약관을 확인하세요.
> MG+ S 하나카드는 2025-10-18, KB국민 나라사랑체크카드는 2025-12-24,
> SKT 우리카드는 신규 발급이 중단된 상품입니다. 기존 보유 카드 기준으로 등록했습니다.
> 간편결제 10% 혜택은 결제수단 기준이며 건당 1만원 이상 결제에 적용됩니다. 결제수단을
> `간편결제`로 기록하거나 카테고리를 `간편결제`로 선택하면 정확히 계산됩니다. 영상
> 스트리밍·디지털 멤버십 50%는 월 정기결제 기준입니다.
> 금융 거래·결제·카드사 연동 기능은 제공하지 않습니다.

## Supabase 클라우드 동기화 설정

프로젝트를 만든 뒤 아래 순서로 연결하세요.

1. **SQL 적용**
   Supabase Dashboard → **SQL Editor** → New query에서
   [`supabase/schema.sql`](supabase/schema.sql) 전체를 붙여넣고 **Run**합니다.
   테이블, RLS 정책, `create_household` 함수, Realtime 설정이 한 번에 만들어집니다.
   카드별 전월 실적 구간은 `cards.performance_tiers` JSONB에 저장됩니다.
   `create_household`는 여러 탭이나 개발 모드에서 동시에 호출되어도 가구가
   중복 생성되지 않도록 사용자별 advisory lock을 사용합니다.
   기존 프로젝트를 업데이트한 경우에도 같은 파일을 다시 Run하면 됩니다.

2. **API 키 확인**
   Supabase Dashboard → **Project Settings → API**에서
   **Project URL**과 **anon public key**를 복사합니다.

3. **`.env.local` 입력**
   프로젝트 루트의 `.env.local`에 값을 넣습니다. 파일이 없으면 `.env.example`을 복사해서 만드세요.

   ```env
   VITE_SUPABASE_URL=https://프로젝트ID.supabase.co
   VITE_SUPABASE_ANON_KEY=anon-public-key
   ```

4. **개발 서버 재시작**
   `.env.local`은 서버 시작 시 읽으므로 `npm run dev`를 다시 실행합니다.

5. **회원가입 후 로그인**
   앱에서 이메일과 6자 이상 비밀번호로 계정을 만들고 로그인합니다.
   Supabase **Authentication → Providers → Email**에서 이메일 확인을 켜 두었다면
   받은 메일의 확인 링크를 먼저 눌러야 합니다.
   확인 메일 없이 바로 테스트하려면 이메일 확인 기능을 잠시 끄면 됩니다.

6. **인증 URL 확인**
   이메일 확인 링크를 쓰려면 Supabase **Authentication → URL Configuration**에서
   **Site URL**을 `http://localhost:5173`으로 맞추고,
   **Redirect URLs**에 `http://localhost:5173`을 추가하세요.
   배포 후에는 실제 도메인으로 바꾸면 됩니다.

> 첫 로그인 때 클라우드가 비어 있으면 현재 브라우저의 데이터를 한 번 업로드합니다.
> 이미 클라우드에 데이터가 있으면 클라우드 데이터를 내려받습니다.
> **JSON 가져오기와 초기 상태로 되돌리기는 클라우드 데이터도 함께 교체**합니다.
> 다른 기기에서 입력한 내용이 사라질 수 있으니 실행 전에 JSON으로 백업하세요.
> 지금은 **같은 계정으로 여러 기기에서 로그인**하는 방식입니다.
> 가족이 각자 다른 계정으로 하나의 가계부를 공유하는 기능은 아직 없습니다.
> `anon` 키는 프런트엔드에 노출되어도 되는 공개 키이며, 실제 접근 제어는 RLS가 담당합니다.
> Supabase가 새 **publishable key**를 보여준다면 그 키를 `VITE_SUPABASE_ANON_KEY`에 넣어도 됩니다.
> **`service_role` 또는 secret 키는 절대 프런트엔드에 넣지 마세요.**

### 무료 플랜 주의사항

- 프로젝트가 일정 기간 사용되지 않으면 일시중지될 수 있습니다.
- 무료 플랜은 자동 백업이 없으므로 중요한 데이터는 **설정 → JSON 내보내기**로 백업하세요.
- 여러 기기에서 동시에 수정하면 마지막 저장이 반영됩니다.

## 데이터 저장

### Supabase 모드

`.env.local`에 URL과 anon key가 있으면 로그인 후 클라우드 모드로 동작합니다.

- `households`, `household_members`, `cards`, `transactions` 테이블에 저장됩니다.
- RLS로 같은 가구 구성원만 데이터를 읽고 쓸 수 있습니다.
- 카드·결제 내역 변경은 Supabase에 자동 저장되고 Realtime으로 다른 기기에 반영됩니다.
- 브라우저에는 `ssen-ledger-state-v2:<household-id>` 키로 캐시를 남깁니다.

### 로컬 모드

Supabase 환경변수가 없으면 기존처럼 브라우저에만 저장됩니다.

- `localStorage`의 `ssen-ledger-state-v2` 키에 저장됩니다.
- 서버로 전송되지 않으며, 같은 브라우저에서만 유지됩니다.
- 브라우저 데이터를 지우면 내역도 사라지므로, 중요한 데이터는 **설정 → JSON 내보내기**로 백업하세요.
- JSON으로 다른 기기·브라우저에 옮길 수 있습니다.
- 새로 시작하면 실제 보유 카드 5장과 빈 결제 내역으로 시작합니다.

### 모니터링과 개인정보

Datadog RUM/Logs는 성능과 오류 확인을 위해서만 사용합니다.

- 세션 리플레이(화면 녹화)는 기본 비활성화되어 있습니다.
- 화면 텍스트, 입력값, 클릭 대상, URL 쿼리·해시, 이메일, UUID, 긴 숫자는 전송 전에 마스킹됩니다.
- 로그인 사용자는 원본 UUID/이메일 대신 익명 해시 ID만 전송합니다.
- `VITE_DATADOG_ENABLED=false`로 Datadog 연동을 완전히 끌 수 있습니다.

## 기술 스택

- React 19 + TypeScript
- Vite 5
- Supabase Postgres + Auth + Realtime
- 외부 UI·차트 라이브러리 없이 CSS와 SVG로 구현
- 상태 관리: React Context + `localStorage` 캐시 + Supabase
- 반응형: 데스크톱 상단 내비게이션 / 모바일 하단 내비게이션

## 프로젝트 구조

```text
src/
  components/   공통 UI, 차트, 로그인 화면, 결제/카드 수정 모달
  data/         실제 보유 카드, 카테고리, 초기 상태
  lib/          혜택 계산, 분석, 날짜, 포맷, 백업, Supabase 인증/동기화
  pages/        홈, 가계부, 카드, 리포트, 설정
  store.tsx     전역 상태, 로컬 캐시, 클라우드 동기화
  styles.css    전체 스타일과 반응형 규칙
supabase/
  schema.sql                  테이블, RLS, RPC, Realtime 설정
  agent-api.sql               Muse/Agent API용 스키마 확장 (거래·잔액·고정지출·이력)
  config.toml                 Edge Function 배포 설정 (verify_jwt=false)
  functions/agent-api/        공개 HTTPS REST API Edge Function
docs/
  agent-api.md                Muse 연동 API 사용법
  deploy-agent-api.md         Supabase 직접 배포 체크리스트
  handoff.md                  다른 PC 작업 인계 문서
```

## Muse / Agent API

Muse 같은 클라우드 에이전트가 가계부를 읽고 쓰기 위한 공개 HTTPS REST API가 포함되어 있습니다.

- 위치: `supabase/functions/agent-api/index.ts`
- 인증: `Authorization: Bearer <AGENT_API_KEY>` **단일 키**
- 주소: `https://iglonavoqsihzdobfadh.supabase.co/functions/v1/agent-api`
- 카드 연결: `GET /v1/cards`로 카드 목록을 확인하고, 거래에 `cardName`을 보내면 서버가 카드 ID로 자동 변환
- 스키마: `supabase/agent-api.sql`
- 자세한 사용법: [`docs/agent-api.md`](docs/agent-api.md)
- 직접 배포 체크리스트: [`docs/deploy-agent-api.md`](docs/deploy-agent-api.md)

지원 범위:

- 거래 CRUD (날짜·거래유형·대분류/소분류·금액·보정·메모·결제수단·고정 UUID)
- 하드 삭제 없는 소프트 취소/복구 + 변경 이력
- 월말 잔액 B~G 저장/조회와 시트 규칙 계산
- 월별 집계, 카테고리별 집계, 고정지출 목록
- 명확한 JSON 필드 오류

### 배포 요약

1. Supabase SQL Editor에서 `supabase/agent-api.sql` 실행
2. Edge Function Secrets에 `AGENT_API_KEY` 추가 (필요 시 `AGENT_HOUSEHOLD_ID`)
3. `npx --yes supabase@latest functions deploy agent-api --no-verify-jwt --project-ref <PROJECT_REF>`
4. `https://<PROJECT_REF>.supabase.co/functions/v1/agent-api/v1/health` 확인

새 secret key(`sb_secret_...`) 또는 legacy `service_role` 키는 Edge Function Secret에만 두고 프런트엔드나 Muse에 전달하지 않습니다.

## 스크립트

```bat
npm run dev      개발 서버 실행
npm run build    타입 검사 + 프로덕션 빌드
npm run preview  빌드 결과 미리보기
```

> **개인 데이터 주의**
> 실제 거래 내역, 잔액, 시트 이관용 JSON/스크립트는 저장소에 커밋하지 마세요.
> `.env`, `.env.local`, `.env.agent`, `.private/`는 `.gitignore`로 제외됩니다.
> Google Sheet 원본은 '링크가 있는 모든 사용자'로 공개하지 말고, 이관 후에는 공유를 '제한됨'으로 바꾸세요.
