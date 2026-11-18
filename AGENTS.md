# AGENTS.md — ssen-ledger 작업 규칙

이 문서는 Antigravity 및 AI 에이전트가 `ssen-ledger` 저장소에서 코드를 수정할 때 따라야 하는 기본 작업 규칙입니다.

---

## 1. 폴더 구조 및 Git 브랜치 관리 원칙

### 폴더 및 Worktree 구조
`<프로젝트-루트>/ssen-ledger/` 아래에서 기준 저장소(`main`)와 AI 도구별 `worktree`를 분리해 관리합니다.

```text
<프로젝트-루트>/ssen-ledger/
├── main/                  # 기준 브랜치 (main 전용, 직접 수정 금지)
└── worktrees/
    ├── codex/             # Codex 작업용 worktree
    ├── antigravity/       # Antigravity 작업용 worktree
    └── opencode/          # OpenCode 작업용 worktree
```

- **`main/` 폴더는 읽기/검증/머지 전용**: `main` 브랜치는 항상 안정/배포 가능한 기준 상태로 유지하며, 직접 코드를 수정하지 않습니다.
- **작업은 각 도구별 `worktrees/<도구>/`에서 수행**: Antigravity 작업은 `worktrees/antigravity/`에서 진행합니다.
- **작업 전 브랜치 확인 및 생성**:
  - 코드를 수정하기 전에 현재 브랜치와 위치를 확인합니다(`git branch --show-current`).
  - 작업 시작 전 최신 `main` 기준으로 새 작업 브랜치를 생성한 뒤 수정합니다(`git fetch origin && git switch -c <브랜치명> origin/main`).
    - 기능 추가: `feat/<작업-요약>` (예: `feat/card-progress-group`)
    - 버그 수정: `fix/<작업-요약>` (예: `fix/ledger-header-overlap`)
    - 보안 수정: `security/<작업-요약>` (예: `security/auth-signup-and-agent-cors`)
    - 스타일/리팩터링: `chore/<작업-요약>` 또는 `refactor/<작업-요약>`
  - 이미 작업 중인 피처 브랜치 위에서 이어서 수정하는 경우 해당 브랜치를 그대로 사용합니다.
- **원격 반영(`push`) 및 병합(`merge`)**:
  - 사용자의 명시적 요청 없이 `main`에 직접 push/merge 하거나 force push(`--force`)를 실행하지 않습니다.
  - 작업 완료 후 변경된 파일 목록, 핵심 변경 내용, 검증 결과를 요약해 사용자가 리뷰 후 커밋/PR을 진행할 수 있도록 안내합니다.
  - `main` 머지 및 원격 `push`까지 완료된 경우, 작업하던 피처 브랜치는 삭제(`git branch -d <브랜치명>`)하고 해당 worktree를 기본 워크스페이스 브랜치(`worktrees/<도구>` → `<도구>/workspace`)로 전환해 최신 `origin/main`에 맞춰 둡니다.
- **새 Worktree / 환경 파일 주의**:
  - `.env.local`, `.env.agent` 등 Git에 포함되지 않은 환경 파일과 `node_modules`는 worktree 간 공유되지 않으므로, 초기 세팅 또는 패키지 변경 시 해당 worktree에서 확인/`npm install`을 수행합니다.

---

## 2. 코드 수정 및 품질 기준

- **기존 스타일 유지**: TypeScript, React 19, Vite, Zod 기반의 기존 코드 스타일과 컴포넌트 구조를 따릅니다.
- **범위 최소화**: 요청된 작업과 무관한 파일이나 기존 주석/포맷팅을 불필요하게 변경하지 않습니다.
- **민감 정보 보호**: Supabase 키, Datadog 토큰, `.env` 등 환경변수와 자격 증명을 소스 코드에 하드코딩하거나 응답에 노출하지 않습니다.

---

## 3. 수정 후 필수 검증

코드 수정이 끝난 뒤에는 반드시 아래 명령으로 타입 체크 및 프로덕션 빌드가 통과하는지 확인합니다.

```bash
npm run build
```

(`tsc --noEmit && vite build`가 에러 없이 종료되어야 합니다.)

- **브라우저 확인 및 테스트**:
  - UI 확인이나 브라우저 테스트가 필요할 때는 내장 브라우저나 Playwright 대신 **Ego Lite 브라우저(`ego-browser`)**를 사용합니다.
  - Windows PowerShell에서는 `.mjs` 스크립트 파일(`C:/Users/<Username>/ego/<task>/round-01.mjs`)로 작성한 뒤 `cmd /c "ego-browser nodejs < <경로>"`로 실행하고, 작업 종료 시 `await task.finish({ keep: [] })`로 리소스를 정리합니다.

---

## 4. 앱 버전 관리 규칙

`package.json`의 `version`(`MAJOR.MINOR.PATCH`)은 설정 화면의 앱 버전 표시에 자동으로 반영됩니다. 코드 변경 후 `main`에 머지하기 전 아래 기준에 따라 버전을 올립니다.

- **`PATCH` (`x.y.Z`)**: 버그 수정(`fix/`), 보안 수정(`security/`), UI/문구 미세 조정 등 기존 기능 보완
- **`MINOR` (`x.Y.0`)**: 새 기능 추가(`feat/`), 주요 화면·로직 개선
- **`MAJOR` (`X.0.0`)**: DB/데이터 구조 변경 또는 전면 개편 (사용자의 명시적 요청이 있을 때만 변경)
- **예외**: `AGENTS.md`, `README` 등 문서나 개발 규칙만 수정할 때는 버전을 올리지 않습니다.
