import { useEffect, useRef, useState } from 'react'
import { FixedExpenseEditModal } from '../components/FixedExpenseEditModal'
import { Icon } from '../components/Icon'
import { Badge, EmptyState, Modal } from '../components/ui'
import { BUDGET_CATEGORIES, categoryOf, isSavingsCategory } from '../data/categories'
import { downloadText, transactionsToCSV } from '../lib/backup'
import {
  fixedExpenseDayLabel,
  isSavingsFixedExpense,
} from '../lib/fixedExpenses'
import { currentMonth, shiftMonth } from '../lib/date'
import { isExcludedFromSpend } from '../lib/analytics'
import { won, wonShort } from '../lib/format'
import { useAuth } from '../lib/auth'
import { useApp } from '../store'
import type { FixedExpense } from '../types'

function toNumber(value: string): number {
  const parsed = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function formatAmount(value: string | number): string {
  const num = typeof value === 'number' ? value : toNumber(value)
  return num > 0 ? num.toLocaleString('ko-KR') : ''
}

export function SettingsPage() {
  const {
    state,
    fixedExpenses,
    updateSettings,
    resetToInitial,
    clearAll,
    exportJSON,
    importJSON,
    cloudEnabled,
    syncState,
    syncError,
    toggleFavoriteCard,
    setCardSortMode,
  } = useApp()
  const { configured, user, householdId, signOut } = useAuth()
  const [fixedEditor, setFixedEditor] = useState<{
    fixedExpense?: FixedExpense
  } | null>(null)
  const [income, setIncome] = useState(String(state.settings.monthlyIncome))
  const [budget, setBudget] = useState(String(state.settings.monthlyBudget))
  const [goal, setGoal] = useState(String(state.settings.monthlyGoal))
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const category of BUDGET_CATEGORIES) {
      initial[category.id] = String(state.settings.categoryBudgets[category.id] ?? 0)
    }
    return initial
  })
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState('')
  const [dangerModal, setDangerModal] = useState<'reset' | 'clear' | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIncome(String(state.settings.monthlyIncome))
    setBudget(String(state.settings.monthlyBudget))
    setGoal(String(state.settings.monthlyGoal))
    const next: Record<string, string> = {}
    for (const category of BUDGET_CATEGORIES) {
      next[category.id] = String(state.settings.categoryBudgets[category.id] ?? 0)
    }
    setCategoryBudgets(next)
  }, [state.settings])

  useEffect(() => {
    if (!saved) return
    const timer = window.setTimeout(() => setSaved(false), 2500)
    return () => window.clearTimeout(timer)
  }, [saved])

  const handleSave = () => {
    const budgets: Record<string, number> = {}
    for (const category of BUDGET_CATEGORIES) {
      budgets[category.id] = toNumber(categoryBudgets[category.id] ?? '0')
    }
    updateSettings({
      monthlyIncome: toNumber(income),
      monthlyBudget: toNumber(budget),
      monthlyGoal: toNumber(goal),
      categoryBudgets: budgets,
    })
    setSaved(true)
  }

  const handleFillFromPrevMonth = () => {
    const prev = shiftMonth(currentMonth(), -1)
    const prevTxs = state.transactions.filter(
      (t) =>
        t.date.startsWith(prev) &&
        !t.excluded &&
        !isSavingsCategory(t.categoryId) &&
        !isExcludedFromSpend(t),
    )
    const nextBudgets: Record<string, string> = {}
    for (const cat of BUDGET_CATEGORIES) {
      const catSpend = prevTxs
        .filter((t) => t.categoryId === cat.id)
        .reduce((sum, t) => sum + t.amount, 0)
      const rounded = catSpend > 0 ? Math.ceil(catSpend / 10000) * 10000 : 0
      nextBudgets[cat.id] = String(rounded)
    }
    setCategoryBudgets(nextBudgets)
    setMessage(
      `${Number(prev.slice(5))}월 실지출 기준으로 카테고리 예산을 채웠어요. '설정 저장'을 눌러 반영해 주세요.`,
    )
  }

  const handleClearCategoryBudgets = () => {
    const cleared: Record<string, string> = {}
    for (const cat of BUDGET_CATEGORIES) {
      cleared[cat.id] = '0'
    }
    setCategoryBudgets(cleared)
  }

  const handleExportJSON = () => {
    const today = new Date().toISOString().slice(0, 10)
    downloadText(`ssen-ledger-${today}.json`, exportJSON(), 'application/json;charset=utf-8')
  }

  const handleExportCSV = () => {
    const today = new Date().toISOString().slice(0, 10)
    downloadText(
      `ssen-ledger-${today}.csv`,
      transactionsToCSV(state.transactions, state.cards),
      'text/csv;charset=utf-8',
      true,
    )
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    const result = importJSON(text)
    setMessage(result.message)
  }

  const activeFixedExpenses = fixedExpenses.filter(
    (fixedExpense) => fixedExpense.active,
  )
  const fixedLiving = activeFixedExpenses.filter(
    (f) => !isSavingsFixedExpense(f),
  )
  const fixedSavings = activeFixedExpenses.filter(
    (f) => isSavingsFixedExpense(f),
  )
  const fixedLivingTotal = fixedLiving.reduce((sum, f) => sum + f.amount, 0)
  const fixedSavingsTotal = fixedSavings.reduce((sum, f) => sum + f.amount, 0)
  const fixedGrandTotal = fixedLivingTotal + fixedSavingsTotal

  const categoryBudgetsSum = Object.values(categoryBudgets).reduce(
    (sum, val) => sum + toNumber(val),
    0,
  )
  const totalBudget = toNumber(budget)
  const budgetDiff = totalBudget - categoryBudgetsSum
  const recommendedGoal = Math.max(0, toNumber(income) - toNumber(budget))

  const syncLabel = !configured
    ? '로컬 모드'
    : syncState === 'syncing'
      ? '동기화 중'
      : syncState === 'error'
        ? '동기화 오류'
        : '동기화됨'

  const syncTone =
    !configured || syncState === 'local'
      ? 'neutral'
      : syncState === 'error'
        ? 'danger'
        : syncState === 'syncing'
          ? 'warn'
          : 'success'

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="page-head__eyebrow">SETTINGS</p>
          <h1>설정</h1>
        </div>
      </header>

      <div className="settings-grid">
        <section className="panel">
          <header className="panel__head">
            <div>
              <h2>수입과 예산</h2>
              <p>저축 목표와 카테고리 예산을 조정해요</p>
            </div>
            {saved && <Badge tone="success">저장했어요</Badge>}
          </header>

          <div className="form">
            <div className="field-row">
              <div className="field">
                <label htmlFor="set-income">월 수입 (원)</label>
                <div className="amount-input-group">
                  <div className="amount-input">
                    <input
                      id="set-income"
                      inputMode="numeric"
                      placeholder="0"
                      value={formatAmount(income)}
                      onChange={(event) =>
                        setIncome(event.target.value.replace(/[^\d]/g, '').slice(0, 11))
                      }
                    />
                    <span>원</span>
                  </div>
                  <div className="quick-amount-row">
                    <span className="quick-amount-hint">{won(toNumber(income))}</span>
                    <div className="quick-amount-buttons">
                      <button
                        type="button"
                        className="btn btn--tiny btn--ghost"
                        onClick={() => setIncome(String(toNumber(income) + 100_000))}
                      >
                        +10만
                      </button>
                      <button
                        type="button"
                        className="btn btn--tiny btn--ghost"
                        onClick={() => setIncome(String(toNumber(income) + 500_000))}
                      >
                        +50만
                      </button>
                      <button
                        type="button"
                        className="btn btn--tiny btn--ghost"
                        onClick={() => setIncome(String(toNumber(income) + 1_000_000))}
                      >
                        +100만
                      </button>
                      <button
                        type="button"
                        className="btn btn--tiny btn--ghost"
                        onClick={() => setIncome('0')}
                      >
                        0원
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="field">
                <label htmlFor="set-budget">월 지출 예산 (원)</label>
                <div className="amount-input-group">
                  <div className="amount-input">
                    <input
                      id="set-budget"
                      inputMode="numeric"
                      placeholder="0"
                      value={formatAmount(budget)}
                      onChange={(event) =>
                        setBudget(event.target.value.replace(/[^\d]/g, '').slice(0, 11))
                      }
                    />
                    <span>원</span>
                  </div>
                  <div className="quick-amount-row">
                    <span className="quick-amount-hint">{won(toNumber(budget))}</span>
                    <div className="quick-amount-buttons">
                      <button
                        type="button"
                        className="btn btn--tiny btn--ghost"
                        onClick={() => setBudget(String(toNumber(budget) + 100_000))}
                      >
                        +10만
                      </button>
                      <button
                        type="button"
                        className="btn btn--tiny btn--ghost"
                        onClick={() => setBudget(String(toNumber(budget) + 500_000))}
                      >
                        +50만
                      </button>
                      <button
                        type="button"
                        className="btn btn--tiny btn--ghost"
                        onClick={() => setBudget(String(toNumber(budget) + 1_000_000))}
                      >
                        +100만
                      </button>
                      <button
                        type="button"
                        className="btn btn--tiny btn--ghost"
                        onClick={() => setBudget('0')}
                      >
                        0원
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="field">
              <label htmlFor="set-goal">월 저축 목표 (원)</label>
              <div className="amount-input-group">
                <div className="amount-input">
                  <input
                    id="set-goal"
                    inputMode="numeric"
                    placeholder="0"
                    value={formatAmount(goal)}
                    onChange={(event) =>
                      setGoal(event.target.value.replace(/[^\d]/g, '').slice(0, 11))
                    }
                  />
                  <span>원</span>
                </div>
                <div className="quick-amount-row">
                  <span className="quick-amount-hint">{won(toNumber(goal))}</span>
                  <div className="quick-amount-buttons">
                    <button
                      type="button"
                      className="btn btn--tiny btn--ghost"
                      onClick={() => setGoal(String(toNumber(goal) + 100_000))}
                    >
                      +10만
                    </button>
                    <button
                      type="button"
                      className="btn btn--tiny btn--ghost"
                      onClick={() => setGoal(String(toNumber(goal) + 500_000))}
                    >
                      +50만
                    </button>
                    <button
                      type="button"
                      className="btn btn--tiny btn--ghost"
                      onClick={() => setGoal(String(toNumber(goal) + 1_000_000))}
                    >
                      +100만
                    </button>
                    {recommendedGoal > 0 && (
                      <button
                        type="button"
                        className="btn btn--tiny btn--ghost"
                        onClick={() => setGoal(String(recommendedGoal))}
                        title="수입 - 예산 차액으로 설정"
                      >
                        권장액 적용
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <span className="field__hint">
                수입 {won(toNumber(income))} − 지출 예산 {won(toNumber(budget))} ={' '}
                <strong>{won(recommendedGoal)}</strong> 남음
              </span>
            </div>

            <div className="field">
              <label>카테고리별 예산</label>

              <div
                className={`budget-summary-bar budget-summary-bar--${
                  budgetDiff === 0 ? 'good' : budgetDiff > 0 ? 'info' : 'warn'
                }`}
              >
                <div className="budget-summary-bar__header">
                  <div>
                    <strong>카테고리 예산 합계: {won(categoryBudgetsSum)}</strong>
                    <span>
                      {budgetDiff === 0
                        ? '총 지출 예산과 정확히 일치해요'
                        : budgetDiff > 0
                          ? `총 지출 예산(${won(totalBudget)}) 대비 ${won(budgetDiff)} 미배분`
                          : `총 지출 예산(${won(totalBudget)}) 대비 ${won(-budgetDiff)} 초과 편성됨`}
                    </span>
                  </div>
                  <Badge
                    tone={
                      budgetDiff === 0
                        ? 'success'
                        : budgetDiff > 0
                          ? 'neutral'
                          : 'warn'
                    }
                  >
                    {budgetDiff === 0
                      ? '균형'
                      : budgetDiff > 0
                        ? `${wonShort(budgetDiff)} 남음`
                        : `${wonShort(-budgetDiff)} 초과`}
                  </Badge>
                </div>
                <div className="budget-summary-bar__actions">
                  <button
                    type="button"
                    className="btn btn--tiny btn--ghost"
                    onClick={handleFillFromPrevMonth}
                  >
                    <Icon name="sparkles" size={14} />
                    지난달 실지출 기준으로 채우기
                  </button>
                  <button
                    type="button"
                    className="btn btn--tiny btn--ghost"
                    onClick={handleClearCategoryBudgets}
                  >
                    예산 비우기
                  </button>
                </div>
              </div>

              <div className="budget-inputs">
                {BUDGET_CATEGORIES.map((category) => (
                  <label className="budget-input" key={category.id}>
                    <span>
                      {category.emoji} {category.label}
                    </span>
                    <input
                      inputMode="numeric"
                      value={formatAmount(categoryBudgets[category.id] ?? '0')}
                      onChange={(event) =>
                        setCategoryBudgets((current) => ({
                          ...current,
                          [category.id]: event.target.value
                            .replace(/[^\d]/g, '')
                            .slice(0, 10),
                        }))
                      }
                      placeholder="0"
                      aria-label={`${category.label} 예산`}
                    />
                    <span className="budget-input__unit">원</span>
                  </label>
                ))}
              </div>
              <span className="field__hint">
                저축은 카테고리 예산이 아니라 위의 월 저축 목표로 관리해요.
              </span>
            </div>

            <div className="form__actions">
              <button type="button" className="btn btn--primary" onClick={handleSave}>
                <Icon name="check" size={18} />
                설정 저장
              </button>
            </div>
          </div>
        </section>

        <div className="stack">
          <section className="panel">
            <header className="panel__head">
              <div>
                <h2>계정 · 동기화</h2>
                <p>
                  {configured
                    ? user?.email ?? '로그인됨'
                    : 'Supabase 없이 이 브라우저에만 저장 중'}
                </p>
              </div>
              <Badge tone={syncTone}>{syncLabel}</Badge>
            </header>

            {configured && householdId && (
              <div className="household-info-pill">
                <span className="household-info-pill__label">가구</span>
                <strong>우리 집</strong>
                <code>{householdId.slice(0, 8)}…</code>
              </div>
            )}

            {syncError && (
              <p className="form__error settings-sync-error" role="alert">
                {syncError}
              </p>
            )}

            <div className="settings-actions">
              {configured ? (
                <>
                  {syncState === 'error' && (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => window.location.reload()}
                    >
                      다시 연결
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => void signOut()}
                  >
                    로그아웃
                  </button>
                </>
              ) : (
                <p className="panel__note settings-note--tight">
                  클라우드 동기화를 쓰려면 프로젝트의 <code>.env.local</code>에
                  Supabase URL과 anon key를 넣고 서버를 다시 시작해 주세요.
                </p>
              )}
            </div>

            <p className="panel__note">
              {cloudEnabled
                ? '변경 사항은 Supabase에 자동 저장되고, 다른 기기에도 실시간으로 반영돼요.'
                : configured
                  ? '현재는 로컬 데이터로 동작하고 있어요. 동기화 오류를 확인해 주세요.'
                  : '로그인하면 여러 기기에서 같은 가계부를 사용할 수 있어요.'}
            </p>
          </section>

          <section className="panel">
            <header className="panel__head">
              <div>
                <h2>데이터</h2>
                <p>
                  내역 {state.transactions.length}건 · 카드 {state.cards.length}장
                </p>
              </div>
            </header>
            <div className="settings-actions">
              <button type="button" className="btn btn--ghost" onClick={handleExportJSON}>
                JSON 내보내기
              </button>
              <button type="button" className="btn btn--ghost" onClick={handleExportCSV}>
                CSV 내보내기
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => fileInput.current?.click()}
              >
                JSON 가져오기
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  void handleImport(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </div>
            {message && <p className="settings-message">{message}</p>}
            <p className="panel__note">
              {cloudEnabled
                ? '클라우드에 저장되는 중이에요. JSON 내보내기는 백업용으로 계속 사용할 수 있어요.'
                : '데이터는 이 브라우저(localStorage)에만 저장돼요. 기기를 바꾸면 JSON으로 옮겨주세요.'}
            </p>
          </section>

          <section className="panel">
            <header className="panel__head">
              <div>
                <h2>초기화</h2>
                <p>결제·저축 내역을 비우거나 카드·예산을 초기 상태로 되돌릴 수 있어요</p>
              </div>
            </header>
            <div className="settings-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setDangerModal('reset')
                  setConfirmText('')
                }}
              >
                초기 상태로 되돌리기
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--danger"
                onClick={() => {
                  setDangerModal('clear')
                  setConfirmText('')
                }}
              >
                결제·저축 내역 전체 삭제
              </button>
            </div>
          </section>

          <section className="panel about">
            <div className="about__mark">쎈</div>
            <div>
              <h2>쎈 가계부</h2>
              <p>
                카드 실적과 혜택을 자동 계산하고, 결제 전 가장 쎈 카드를 알려주는 가계부예요.
                {cloudEnabled
                  ? ' 데이터는 Supabase 클라우드와 안전하게 동기화됩니다.'
                  : ' 데이터는 현재 브라우저 안에서만 처리됩니다.'}
              </p>
              <p className="about__note">
                카드 혜택 조건은 시연용 예시값이며 실제 카드사 약관과 다를 수 있습니다. 금융
                거래·결제 기능은 제공하지 않습니다.
              </p>
            </div>
          </section>
        </div>
      </div>

      <section className="panel card-settings">
        <header className="panel__head">
          <div>
            <h2>카드 및 결제 환경설정</h2>
            <p>기본 카드 정렬 기준과 상단 고정할 즐겨찾기 카드를 설정해요</p>
          </div>
        </header>

        <div className="form">
          <div className="field">
            <label>기본 카드 정렬 기준</label>
            <div className="sort-mode-options">
              <button
                type="button"
                className={`sort-mode-btn${(state.settings.cardSortMode ?? 'requirement') === 'requirement' ? ' is-active' : ''}`}
                onClick={() => setCardSortMode('requirement')}
              >
                <Icon name="check" size={16} />
                <div>
                  <strong>실적 채움 우선 (권장)</strong>
                  <span>전월 실적에 도달하지 못한 카드를 상단에 먼저 보여줘요.</span>
                </div>
              </button>
              <button
                type="button"
                className={`sort-mode-btn${state.settings.cardSortMode === 'spend' ? ' is-active' : ''}`}
                onClick={() => setCardSortMode('spend')}
              >
                <Icon name="chart" size={16} />
                <div>
                  <strong>당월 결제 많은 순</strong>
                  <span>이번 달 결제 금액이 많은 카드 순서대로 정렬해요.</span>
                </div>
              </button>
              <button
                type="button"
                className={`sort-mode-btn${state.settings.cardSortMode === 'default' ? ' is-active' : ''}`}
                onClick={() => setCardSortMode('default')}
              >
                <Icon name="card" size={16} />
                <div>
                  <strong>등록 순서대로</strong>
                  <span>카드를 추가한 기본 순서대로 보여줘요.</span>
                </div>
              </button>
            </div>
          </div>

          <div className="field">
            <label>즐겨찾기 카드 (상단 고정)</label>
            <span className="field__hint">
              ⭐ 별표를 누르면 정렬 기준과 상관없이 카드 탭 및 거래 추가 모달에서 최상단에 우선 표시돼요.
            </span>
            <div className="fav-cards-list">
              {state.cards.map((card) => {
                const isFav = (state.settings.favoriteCardIds ?? []).includes(card.id)
                return (
                  <button
                    key={card.id}
                    type="button"
                    className={`fav-card-chip${isFav ? ' is-fav' : ''}${card.active ? '' : ' is-hidden'}`}
                    onClick={() => toggleFavoriteCard(card.id)}
                    title={isFav ? '즐겨찾기 해제' : '즐겨찾기 고정'}
                  >
                    <span
                      className="fav-card-chip__dot"
                      style={{
                        background: `linear-gradient(135deg, ${card.colorFrom}, ${card.colorTo})`,
                      }}
                    />
                    <span className="fav-card-chip__name">
                      {card.name}
                      {!card.active && ' (숨김)'}
                    </span>
                    <Icon name={isFav ? 'starFilled' : 'star'} size={15} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="panel fixed-settings">
        <header className="panel__head">
          <div>
            <h2>고정지출·저축 관리</h2>
            <p>
              매월 반영 후보를 만들고, 확인 후 실제 거래로 기록해요. 반영 전에는
              지출·저축에 잡히지 않아요.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setFixedEditor({})}
          >
            <Icon name="plus" size={18} />
            고정지출·저축 등록
          </button>
        </header>

        {activeFixedExpenses.length > 0 && (
          <div className="fixed-summary-bar">
            <div className="fixed-summary-col">
              <span className="fixed-summary-label">활성 항목</span>
              <strong className="fixed-summary-value">{activeFixedExpenses.length}건</strong>
            </div>
            <div className="fixed-summary-col">
              <span className="fixed-summary-label">고정 생활비</span>
              <strong className="fixed-summary-value">{won(fixedLivingTotal)}</strong>
            </div>
            <div className="fixed-summary-col">
              <span className="fixed-summary-label">고정 저축</span>
              <strong className="fixed-summary-value">{won(fixedSavingsTotal)}</strong>
            </div>
            <div className="fixed-summary-col fixed-summary-col--total">
              <span className="fixed-summary-label">월 고정 합계</span>
              <strong className="fixed-summary-value">{won(fixedGrandTotal)}</strong>
            </div>
          </div>
        )}

        {activeFixedExpenses.length === 0 ? (
          <EmptyState
            emoji="📌"
            title="등록된 고정지출·저축이 없어요"
            body="월세·보험료·구독·적립식 저축처럼 매월 반복되는 항목을 등록해 보세요."
          />
        ) : (
          <ul className="fixed-settings-list">
            {activeFixedExpenses.map((fixedExpense) => {
              const category = categoryOf(fixedExpense.categoryId)
              const card = fixedExpense.cardId
                ? state.cards.find((item) => item.id === fixedExpense.cardId)
                : undefined
              return (
                <li className="fixed-settings-row" key={fixedExpense.id}>
                  <span
                    className="fixed-settings-row__icon"
                    style={{ background: `${category.color}18` }}
                  >
                    {category.emoji}
                  </span>
                  <div className="fixed-settings-row__main">
                    <strong>{fixedExpense.name}</strong>
                    <span>
                      매월 {fixedExpenseDayLabel(fixedExpense.dayOfMonth)} ·{' '}
                      {isSavingsFixedExpense(fixedExpense)
                        ? '저축'
                        : category.label}{' '}
                      · {card?.name ?? fixedExpense.paymentMethod ?? '현금·계좌'}
                    </span>
                    <small>
                      {isSavingsFixedExpense(fixedExpense) ? '저축 · ' : ''}
                      {fixedExpense.categoryMajor}-{fixedExpense.categoryMinor}
                      {fixedExpense.startMonth
                        ? ` · ${fixedExpense.startMonth}부터`
                        : ''}
                    </small>
                  </div>
                  <strong className="fixed-settings-row__amount">
                    {won(fixedExpense.amount)}
                  </strong>
                  <button
                    type="button"
                    className="btn btn--tiny btn--ghost"
                    onClick={() => setFixedEditor({ fixedExpense })}
                  >
                    수정
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {fixedEditor && (
        <FixedExpenseEditModal
          key={fixedEditor.fixedExpense?.id ?? 'new-fixed'}
          fixedExpense={fixedEditor.fixedExpense}
          onClose={() => setFixedEditor(null)}
        />
      )}

      {dangerModal && (
        <Modal
          title={
            dangerModal === 'reset'
              ? '가계부 초기 상태로 되돌리기'
              : '결제·저축 내역 전체 삭제'
          }
          subtitle={
            cloudEnabled
              ? '⚠️ 현재 클라우드 동기화(우리 집)가 활성화되어 있습니다.'
              : '현재 브라우저에 저장된 데이터에 적용됩니다.'
          }
          onClose={() => setDangerModal(null)}
          footer={
            <div className="modal__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setDangerModal(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={
                  confirmText.trim() !==
                  (dangerModal === 'reset' ? '초기화' : '삭제')
                }
                onClick={() => {
                  if (dangerModal === 'reset') {
                    resetToInitial()
                    setMessage('초기 상태로 되돌렸어요.')
                  } else {
                    clearAll()
                    setMessage('결제·저축 내역을 모두 삭제했어요.')
                  }
                  setDangerModal(null)
                }}
              >
                {dangerModal === 'reset' ? '초기 상태로 되돌리기' : '내역 전체 삭제'}
              </button>
            </div>
          }
        >
          <div className="danger-modal-body">
            <p className="danger-modal-desc">
              {dangerModal === 'reset' ? (
                <>
                  지금까지 입력한 <strong>모든 결제·저축 내역, 카드 및 예산 설정</strong>이 초기 샘플 데이터로 덮어씌워집니다.
                  {cloudEnabled && ' 클라우드 데이터베이스에도 즉시 반영되므로 복구할 수 없습니다.'}
                </>
              ) : (
                <>
                  지금까지 기록된 <strong>모든 결제·저축 거래 내역</strong>이 삭제됩니다. (카드 목록과 예산 설정은 유지됩니다)
                  {cloudEnabled && ' 클라우드 데이터베이스에서도 함께 삭제됩니다.'}
                </>
              )}
            </p>
            <div className="field">
              <label htmlFor="confirm-danger-text">
                계속 진행하려면 아래에 <strong>'{dangerModal === 'reset' ? '초기화' : '삭제'}'</strong>를 입력해 주세요.
              </label>
              <input
                id="confirm-danger-text"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={dangerModal === 'reset' ? '초기화' : '삭제'}
                autoComplete="off"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
