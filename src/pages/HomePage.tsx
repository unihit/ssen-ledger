import { navigateTo } from '../lib/scroll'
import { Badge, EmptyState, MonthPicker, Progress } from '../components/ui'
import { CategoryBars } from '../components/charts'
import { Icon } from '../components/Icon'
import { useApp } from '../store'
import type { Tab } from '../nav'
import type { Transaction } from '../types'
import {
  budgetSummary,
  categoryBudgetRows,
  categorySlices,
  monthTransactions,
} from '../lib/analytics'
import { computeCardMonth } from '../lib/benefits'
import { categoryOf, isSavingsCategory } from '../data/categories'
import {
  currentMonth,
  daysElapsed,
  daysInMonth,
  formatDateKo,
  todayISO,
} from '../lib/date'
import {
  fixedExpenseDayLabel,
  fixedExpenseStatus,
  fixedExpensesForMonth,
  isSavingsFixedExpense,
} from '../lib/fixedExpenses'
import { won, wonShort } from '../lib/format'

export function HomePage({
  onAdd,
  onEdit,
  onNavigate,
}: {
  onAdd: () => void
  onEdit: (transaction: Transaction) => void
  onNavigate: (tab: Tab) => void
}) {
  const {
    state,
    month,
    setMonth,
    fixedExpenses,
    fixedExpenseApplications,
  } = useApp()
  const summary = budgetSummary(state, month)
  const slices = categorySlices(state.transactions, month)
  const budgetRows = categoryBudgetRows(state, month)
    .filter((row) => row.budget > 0)
    .sort((a, b) => b.spend - a.spend || b.budget - a.budget)
    .slice(0, 5)

  const cards = state.cards.filter((card) => card.active)
  const cardMonths = cards.map((card) => computeCardMonth(card, state.transactions, month))
  const benefit = cardMonths.reduce((total, item) => total + item.totalBenefit, 0)

  const closestRequirement = [...cardMonths]
    .filter(
      (item) =>
        item.card.minSpendForBenefits > 0 &&
        item.toRequirement > 0 &&
        item.toRequirement <= 100_000,
    )
    .sort((a, b) => a.toRequirement - b.toRequirement)[0]

  const pausedCard = [...cardMonths]
    .filter((item) => item.card.minSpendForBenefits > 0 && !item.performanceMet)
    .sort((a, b) => b.spend - a.spend)[0]

  const cardAlerts: { tone: 'good' | 'warn' | 'info'; title: string; body: string }[] = []

  if (closestRequirement) {
    cardAlerts.push({
      tone: 'warn',
      title: `${closestRequirement.card.name} 실적까지 ${wonShort(closestRequirement.toRequirement)}`,
      body: `이 카드로 이번 달 ${won(closestRequirement.toRequirement)}만 더 결제하면 다음 달 혜택이 켜져요.`,
    })
  }

  if (pausedCard && pausedCard.card.id !== closestRequirement?.card.id) {
    cardAlerts.push({
      tone: 'warn',
      title: `${pausedCard.card.name} 혜택이 잠시 꺼져 있어요`,
      body:
        pausedCard.toRequirement > 0
          ? `전월 실적 ${won(pausedCard.prevSpend)}으로 기준 ${won(pausedCard.card.minSpendForBenefits)}에 못 미쳤어요. 이번 달 ${won(pausedCard.toRequirement)}을 더 쓰면 다음 달부터 혜택이 적용돼요.`
          : '전월 실적이 기준에 못 미쳐 이번 달 혜택이 0원이에요. 이번 달 실적은 이미 채웠으니 다음 달부터 혜택이 적용돼요.',
    })
  }
  const savings = state.settings.monthlyIncome - summary.spend
  const goal = state.settings.monthlyGoal
  const dailyAverage = summary.spend / Math.max(1, daysElapsed(month))

  const manualSavings = monthTransactions(state.transactions, month)
    .filter(
      (transaction) =>
        isSavingsCategory(transaction.categoryId) && !transaction.fixedExpenseId,
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0)

  const recent = [...monthTransactions(state.transactions, month)]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 5)

  const cardName = (id: string | null) =>
    id ? state.cards.find((card) => card.id === id)?.name ?? '카드' : '현금·계좌'

  const fixedItems = fixedExpensesForMonth(fixedExpenses, month).map(
    (fixedExpense) => ({
      fixedExpense,
      ...fixedExpenseStatus(
        fixedExpense,
        month,
        fixedExpenseApplications,
        todayISO(),
        state.transactions,
      ),
    }),
  )
  const fixedTotal = fixedItems.reduce(
    (sum, item) => sum + item.fixedExpense.amount,
    0,
  )
  const fixedRecorded = fixedItems.filter(
    (item) => item.status === 'recorded',
  ).length
  const fixedSavingsApplied = fixedItems.reduce((sum, item) => {
    if (!isSavingsFixedExpense(item.fixedExpense) || !item.application) {
      return sum
    }
    return sum + item.application.amount
  }, 0)
  const fixedSavingsPlanned = fixedItems
    .filter((item) => isSavingsFixedExpense(item.fixedExpense))
    .reduce((sum, item) => sum + item.fixedExpense.amount, 0)
  const totalSavingsApplied = fixedSavingsApplied + manualSavings
  const cashSavings = savings - totalSavingsApplied
  const fixedUpcoming = fixedItems
    .filter((item) => item.status !== 'recorded')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3)

  const isCurrent = month === currentMonth()
  const elapsed = daysElapsed(month)
  const totalDays = daysInMonth(month)
  const paceRatio =
    summary.budget > 0
      ? summary.spend / summary.budget / (elapsed / totalDays)
      : 1
  const isPaceOver = paceRatio > 1.15
  const isPaceUnder = paceRatio < 0.85

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="page-head__eyebrow">MY LEDGER</p>
          <h1>이번 달도 쎈하게</h1>
        </div>
        <div className="page-head__actions">
          <MonthPicker month={month} onChange={setMonth} />
          <button type="button" className="btn btn--primary" onClick={onAdd}>
            <Icon name="plus" size={18} />
            내역 추가
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero__glow" aria-hidden="true" />
        <div className="hero__top">
          <span className="hero__label">이번 달 지출</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {summary.budget > 0 && isCurrent && elapsed >= 3 && !summary.over && (
              <span
                className={`hero__pill ${
                  isPaceOver
                    ? 'hero__pill--warn'
                    : isPaceUnder
                      ? 'hero__pill--save'
                      : ''
                }`}
              >
                {isPaceOver ? '● 페이스 주의' : isPaceUnder ? '● 절약 페이스' : '적정 페이스'}
              </span>
            )}
            <span className="hero__pill">
              {summary.budget > 0
                ? `예산의 ${Math.round(summary.usage * 100)}%`
                : '예산 미설정'}
            </span>
          </div>
        </div>
        <div className="hero__amount">{won(summary.spend)}</div>
        <p className="hero__sub">
          예산 {won(summary.budget)} ·{' '}
          {summary.over ? (
            <span className="hero__over">{won(-summary.remaining)} 초과</span>
          ) : (
            <>
              <strong>{won(summary.remaining)}</strong> 남음
            </>
          )}
        </p>
        <div className="hero__progress">
          <Progress
            value={summary.spend}
            max={summary.budget}
            tone={summary.over ? 'danger' : summary.usage > 0.8 ? 'warn' : 'light'}
          />
        </div>
        <div className="hero__stats">
          <div>
            <span>받은 혜택</span>
            <strong>{won(benefit)}</strong>
          </div>
          <div>
            <span>저축 가능</span>
            <strong className={savings < 0 ? 'is-negative' : ''}>{won(savings)}</strong>
          </div>
          <div>
            <span>하루 평균</span>
            <strong>{won(dailyAverage)}</strong>
          </div>
        </div>
      </section>

      {cardAlerts.length > 0 && (
        <section className="panel home-alerts">
          <header className="panel__head">
            <div>
              <h2>결제 전 알림</h2>
              <p>카드 실적과 혜택에서 챙길 것</p>
            </div>
            <Badge tone="warn">{cardAlerts.length}건</Badge>
          </header>
          <div className="insights">
            {cardAlerts.map((alert) => (
              <article className={`insight insight--${alert.tone}`} key={alert.title}>
                <span className="insight__icon">
                  <Icon name={alert.tone === 'good' ? 'check' : 'sparkles'} size={18} />
                </span>
                <div>
                  <strong>{alert.title}</strong>
                  <p>{alert.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="home-grid">
        <section className="panel">
          <header className="panel__head">
            <div>
              <h2>저축 목표</h2>
              <p>현금 저축 + 고정·기록 저축 기준</p>
            </div>
            <Badge tone={savings >= goal ? 'success' : 'neutral'}>
              {savings >= goal ? '목표 달성' : `목표 ${wonShort(goal)}`}
            </Badge>
          </header>
          <div className="goal">
            <div className="goal__row">
              <span>이번 달 저축 가능액</span>
              <strong>{won(savings)}</strong>
            </div>
            <div className="goal__row goal__row--sub">
              <span>현금 저축</span>
              <strong className={cashSavings < 0 ? 'is-negative' : ''}>
                {won(cashSavings)}
              </strong>
            </div>
            <div className="goal__row goal__row--sub">
              <span>고정 저축 (IRP 등)</span>
              <strong>{won(fixedSavingsApplied)}</strong>
            </div>
            {manualSavings > 0 && (
              <div className="goal__row goal__row--sub">
                <span>저축 기록</span>
                <strong>{won(manualSavings)}</strong>
              </div>
            )}
            <Progress
              value={Math.max(0, savings)}
              max={Math.max(1, goal)}
              tone={savings >= goal ? 'success' : 'accent'}
            />
            <p className="goal__hint">
              수입 {won(state.settings.monthlyIncome)} · 지출 {won(summary.spend)}
              {fixedSavingsPlanned > 0 || manualSavings > 0
                ? ` · 저축 반영 ${won(totalSavingsApplied)}`
                : ''}
              {savings < goal
                ? ` · 목표까지 ${won(Math.max(0, goal - savings))} 남았어요`
                : ' · 이번 달 목표를 채웠어요 🎉'}
            </p>
          </div>
        </section>

        <section className="panel">
          <header className="panel__head">
            <div>
              <h2>카테고리 예산</h2>
              <p>많이 쓴 순서</p>
            </div>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                onNavigate('report')
                navigateTo()
              }}
            >
              리포트
              <Icon name="right" size={15} />
            </button>
          </header>
          <ul className="budget-list">
            {budgetRows.map((row) => (
              <li key={row.category.id}>
                <div className="budget-list__row">
                  <span>
                    {row.category.emoji} {row.category.label}
                  </span>
                  <span>
                    <strong>{won(row.spend)}</strong> / {won(row.budget)}
                  </span>
                </div>
                <Progress
                  value={row.spend}
                  max={row.budget}
                  tone={row.usage >= 1 ? 'danger' : row.usage >= 0.8 ? 'warn' : 'accent'}
                  thin
                />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel fixed-home">
        <header className="panel__head">
          <div>
            <h2>이번 달 고정지출·저축</h2>
            <p>반영 전에는 지출·저축으로 잡히지 않아요</p>
          </div>
          <div className="fixed-panel__summary">
            <strong>{won(fixedTotal)}</strong>
            <span>
              {fixedRecorded}/{fixedItems.length} 반영
              {fixedSavingsPlanned > 0
                ? ` · 저축 ${won(fixedSavingsPlanned)}`
                : ''}
            </span>
          </div>
        </header>
        {fixedItems.length === 0 ? (
          <p className="panel__empty">설정에서 고정지출·저축을 등록해 보세요.</p>
        ) : (
          <div className="fixed-home__body">
            <ul className="fixed-home__list">
              {fixedUpcoming.length === 0 ? (
                <li className="fixed-home__done">
                  <Icon name="check" size={16} /> 이번 달 고정지출을 모두 반영했어요.
                </li>
              ) : (
                fixedUpcoming.map(({ fixedExpense, dueDate }) => (
                  <li key={fixedExpense.id}>
                    <span>{fixedExpense.name}</span>
                    <small>
                      {isSavingsFixedExpense(fixedExpense) ? '저축 · ' : ''}
                      {fixedExpenseDayLabel(fixedExpense.dayOfMonth)} ·{' '}
                      {dueDate.slice(5).replace('-', '/')}
                    </small>
                    <strong>{won(fixedExpense.amount)}</strong>
                  </li>
                ))
              )}
            </ul>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                onNavigate('ledger')
                navigateTo()
              }}
            >
              가계부에서 반영
              <Icon name="right" size={15} />
            </button>
          </div>
        )}
      </section>

      <section className="panel">
        <header className="panel__head">
          <div>
            <h2>카드별 이번 달</h2>
            <p>실적과 혜택을 한 번에</p>
          </div>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              onNavigate('cards')
              navigateTo()
            }}
          >
            카드 관리
            <Icon name="right" size={15} />
          </button>
        </header>
        <div className="mini-cards">
          {cardMonths.map((cardMonth) => (
            <article className="mini-card" key={cardMonth.card.id}>
              <span
                className="mini-card__stripe"
                style={{
                  background: `linear-gradient(135deg, ${cardMonth.card.colorFrom}, ${cardMonth.card.colorTo})`,
                }}
              />
              <span className="mini-card__name">{cardMonth.card.name}</span>
              <strong className="mini-card__spend">{won(cardMonth.spend)}</strong>
              <span className="mini-card__benefit">혜택 {won(cardMonth.totalBenefit)}</span>
              <div className="mini-card__progress">
                <Progress
                  value={cardMonth.spend}
                  max={cardMonth.card.minSpendForBenefits || 1}
                  tone={cardMonth.toRequirement > 0 ? 'warn' : 'success'}
                  thin
                />
              </div>
              <span className="mini-card__status">
                {cardMonth.card.minSpendForBenefits === 0
                  ? '실적 조건 없음'
                  : cardMonth.toRequirement > 0
                    ? `${wonShort(cardMonth.toRequirement)} 남음`
                    : '실적 충족'}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <header className="panel__head">
          <div>
            <h2>최근 결제·저축</h2>
            <p>{Math.round(daysElapsed(month))}일 / {daysInMonth(month)}일 기준</p>
          </div>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              onNavigate('ledger')
              navigateTo()
            }}
          >
            전체 보기
            <Icon name="right" size={15} />
          </button>
        </header>
        {recent.length === 0 ? (
          <EmptyState
            emoji="🧾"
            title="아직 결제·저축 내역이 없어요"
            body="첫 결제나 저축을 추가하면 카드 혜택과 저축 목표를 계산해드릴게요."
          />
        ) : (
          <ul className="tx-list">
            {recent.map((transaction) => {
              const category = categoryOf(transaction.categoryId)
              const savings = isSavingsCategory(transaction.categoryId)
              return (
                <li key={transaction.id}>
                  <button className="tx" type="button" onClick={() => onEdit(transaction)}>
                    <span
                      className="tx__icon"
                      style={{ background: `${category.color}18` }}
                    >
                      {category.emoji}
                    </span>
                    <span className="tx__main">
                      <span className="tx__merchant">
                        {transaction.merchant}
                        {savings && <Badge tone="success">저축</Badge>}
                      </span>
                      <span className="tx__meta">
                        {savings ? '저축 · 계좌' : `${category.label} · ${cardName(transaction.cardId)}`} ·{' '}
                        {formatDateKo(transaction.date)}
                      </span>
                    </span>
                    <span
                      className={`tx__amount${savings ? ' tx__amount--savings' : ''}`}
                    >
                      {savings ? '+' : ''}
                      {won(transaction.amount)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <header className="panel__head">
          <div>
            <h2>이번 달 카테고리</h2>
            <p>지출이 큰 순서</p>
          </div>
          <span className="panel__hint">
            {slices.length > 6 ? `상위 6개 / 전체 ${slices.length}개` : `전체 ${slices.length}개`}
          </span>
        </header>
        {slices.length === 0 ? (
          <EmptyState emoji="📊" title="표시할 지출이 없어요" />
        ) : (
          <CategoryBars slices={slices} limit={6} />
        )}
      </section>
    </div>
  )
}
