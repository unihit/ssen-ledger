import { useEffect, useRef, useState } from 'react'
import { FixedExpenseEditModal } from '../components/FixedExpenseEditModal'
import { Icon } from '../components/Icon'
import { Badge, EmptyState } from '../components/ui'
import { SPENDING_CATEGORIES, categoryOf } from '../data/categories'
import { downloadText, transactionsToCSV } from '../lib/backup'
import {
  fixedExpenseDayLabel,
  isSavingsFixedExpense,
} from '../lib/fixedExpenses'
import { won } from '../lib/format'
import { useAuth } from '../lib/auth'
import { useApp } from '../store'
import type { FixedExpense } from '../types'

function toNumber(value: string): number {
  const parsed = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
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
  } = useApp()
  const { configured, user, signOut } = useAuth()
  const [fixedEditor, setFixedEditor] = useState<{
    fixedExpense?: FixedExpense
  } | null>(null)
  const [income, setIncome] = useState(String(state.settings.monthlyIncome))
  const [budget, setBudget] = useState(String(state.settings.monthlyBudget))
  const [goal, setGoal] = useState(String(state.settings.monthlyGoal))
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const category of SPENDING_CATEGORIES) {
      initial[category.id] = String(state.settings.categoryBudgets[category.id] ?? 0)
    }
    return initial
  })
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIncome(String(state.settings.monthlyIncome))
    setBudget(String(state.settings.monthlyBudget))
    setGoal(String(state.settings.monthlyGoal))
    const next: Record<string, string> = {}
    for (const category of SPENDING_CATEGORIES) {
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
    for (const category of SPENDING_CATEGORIES) {
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

  const handleReset = () => {
    if (
      window.confirm(
        '초기 상태로 되돌릴까요?\n지금 입력한 결제·저축 내역과 설정이 모두 사라집니다.',
      )
    ) {
      resetToInitial()
      setMessage('초기 상태로 되돌렸어요.')
    }
  }

  const handleClear = () => {
    if (window.confirm('모든 결제·저축 내역을 삭제할까요?\n카드와 예산 설정은 그대로 남습니다.')) {
      clearAll()
      setMessage('결제·저축 내역을 모두 삭제했어요.')
    }
  }

  const activeFixedExpenses = fixedExpenses.filter(
    (fixedExpense) => fixedExpense.active,
  )

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
                <input
                  id="set-income"
                  type="number"
                  min={0}
                  step={10000}
                  value={income}
                  onChange={(event) => setIncome(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="set-budget">월 지출 예산 (원)</label>
                <input
                  id="set-budget"
                  type="number"
                  min={0}
                  step={10000}
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="set-goal">월 저축 목표 (원)</label>
              <input
                id="set-goal"
                type="number"
                min={0}
                step={10000}
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
              />
              <span className="field__hint">
                수입 {won(toNumber(income))} − 예산 {won(toNumber(budget))} ={' '}
                {won(Math.max(0, toNumber(income) - toNumber(budget)))}
              </span>
            </div>

            <div className="field">
              <label>카테고리별 예산</label>
              <div className="budget-inputs">
                {SPENDING_CATEGORIES.map((category) => (
                  <label className="budget-input" key={category.id}>
                    <span>
                      {category.emoji} {category.label}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={5000}
                      value={categoryBudgets[category.id] ?? '0'}
                      onChange={(event) =>
                        setCategoryBudgets((current) => ({
                          ...current,
                          [category.id]: event.target.value,
                        }))
                      }
                      aria-label={`${category.label} 예산`}
                    />
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
              <button type="button" className="btn btn--ghost" onClick={handleReset}>
                초기 상태로 되돌리기
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--danger"
                onClick={handleClear}
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
                      · {card?.name ?? '현금·계좌'}
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
    </div>
  )
}
