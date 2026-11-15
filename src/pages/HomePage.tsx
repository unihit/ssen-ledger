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
  isLivingExpense,
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
    toggleFavoriteCard,
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
  const favoriteIds = state.settings.favoriteCardIds ?? []
  const byPriority = (a: (typeof cardMonths)[number], b: (typeof cardMonths)[number]) =>
    Number(favoriteIds.includes(b.card.id)) - Number(favoriteIds.includes(a.card.id)) ||
    a.toRequirement - b.toRequirement || a.card.name.localeCompare(b.card.name, 'ko')
  const cardGroups = [
    { id: 'pending', label: '미충족', title: '실적을 채우는 중', items: cardMonths.filter((item) => item.card.minSpendForBenefits > 0 && item.toRequirement > 0).sort(byPriority) },
    { id: 'unconditional', label: '조건 없음', title: '조건 없이 사용', items: cardMonths.filter((item) => item.card.minSpendForBenefits === 0).sort(byPriority) },
    { id: 'complete', label: '충족', title: '실적 충족', items: cardMonths.filter((item) => item.card.minSpendForBenefits > 0 && item.toRequirement === 0).sort(byPriority) },
  ]
  const benefit = cardMonths.reduce((total, item) => total + item.totalBenefit, 0)

  const cardAlerts: { tone: 'good' | 'warn' | 'info'; title: string; body: string }[] = []

  // 신규 카드 이벤트 추적 알림
  const today = todayISO()
  cards
    .filter((card) => card.event)
    .forEach((card) => {
      const cardEvent = card.event!
      const eventTransactions = state.transactions.filter(
        (t) =>
          t.cardId === card.id &&
          t.date >= '2026-11-01' &&
          t.date <= cardEvent.deadline &&
          !t.excluded &&
          t.amount > 0,
      )
      const eventTotalSpend = eventTransactions.reduce(
        (sum, t) => sum + t.amount,
        0,
      )
      const minSimplePay = cardEvent.minSimplePayAmount ?? 10_000
      const hasSimplePayMet = cardEvent.requireSimplePay
        ? eventTransactions.some(
            (t) => t.paymentMethod === '간편결제' && t.amount >= minSimplePay,
          )
        : true
      const eventAmountMet = eventTotalSpend >= cardEvent.targetAmount
      const eventAllMet = eventAmountMet && hasSimplePayMet

      const targetDate = new Date(`${cardEvent.deadline}T23:59:59`)
      const now = new Date(`${today}T00:00:00`)
      const diffDays = Math.ceil(
        (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      )
      const dDayLabel = diffDays <= 0 ? 'D-Day' : `D-${diffDays}`

      if (!eventAllMet) {
        const remaining = Math.max(0, cardEvent.targetAmount - eventTotalSpend)
        cardAlerts.push({
          tone: diffDays <= 15 ? 'warn' : 'info',
          title: `🎁 [${card.name}] ${cardEvent.title} (${dDayLabel})`,
          body:
            remaining > 0
              ? `${won(remaining)} 더 쓰면 달성!${
                  cardEvent.requireSimplePay
                    ? hasSimplePayMet
                      ? ' · 간편결제 조건 충족'
                      : ' · ⚠️ 간편결제 1만원 이상 1건 필요'
                    : ''
                }`
              : `목표 금액(${won(cardEvent.targetAmount)}) 달성! ⚠️ 간편결제 1만원 이상 1건만 결제하면 완료돼요.`,
        })
      } else {
        cardAlerts.push({
          tone: 'good',
          title: `🎁 [${card.name}] 이벤트 조건 달성 완료!`,
          body: `${cardEvent.title} 목표 금액(${won(cardEvent.targetAmount)})과 간편결제 조건을 모두 완료했어요.`,
        })
      }
    })

  const closestRequirement = [...cardMonths]
    .filter(
      (item) =>
        item.card.minSpendForBenefits > 0 &&
        item.toRequirement > 0 &&
        item.toRequirement <= 100_000,
    )
    .sort((a, b) => a.toRequirement - b.toRequirement)[0]

  const pausedCard = [...cardMonths]
    .filter(
      (item) =>
        item.card.minSpendForBenefits > 0 &&
        !item.performanceMet &&
        !item.inGracePeriod,
    )
    .sort((a, b) => b.spend - a.spend)[0]

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
              <p>실제 저축(적금·IRP 등) 반영 기준</p>
            </div>
            <Badge tone={goal > 0 && totalSavingsApplied >= goal ? 'success' : 'neutral'}>
              {goal > 0
                ? totalSavingsApplied >= goal
                  ? '목표 달성'
                  : `${Math.round((totalSavingsApplied / goal) * 100)}% (${wonShort(totalSavingsApplied)} / ${wonShort(goal)})`
                : '목표 없음'}
            </Badge>
          </header>
          <div className="goal">
            <div className="goal__row">
              <span>이번 달 실제 저축액</span>
              <strong>{won(totalSavingsApplied)}</strong>
            </div>
            {fixedSavingsApplied > 0 && (
              <div className="goal__row goal__row--sub">
                <span>고정 저축 (IRP·적금 등)</span>
                <strong>{won(fixedSavingsApplied)}</strong>
              </div>
            )}
            {manualSavings > 0 && (
              <div className="goal__row goal__row--sub">
                <span>직접 입력 저축</span>
                <strong>{won(manualSavings)}</strong>
              </div>
            )}
            <div className="goal__row goal__row--sub">
              <span>저축 가능 여력 (수입−지출)</span>
              <strong className={savings < 0 ? 'is-negative' : ''}>
                {won(savings)}
              </strong>
            </div>
            <Progress
              value={totalSavingsApplied}
              max={Math.max(1, goal)}
              tone={goal > 0 && totalSavingsApplied >= goal ? 'success' : 'accent'}
            />
            <p className="goal__hint">
              {goal > 0
                ? totalSavingsApplied >= goal
                  ? '이번 달 저축 목표를 달성했어요! 🎉'
                  : `목표(${won(goal)})까지 ${won(Math.max(0, goal - totalSavingsApplied))} 남았어요`
                : '설정에서 저축 목표를 입력해 보세요'}
              {savings > totalSavingsApplied && (
                <span> · 저축 가능 여력 {won(savings - totalSavingsApplied)}</span>
              )}
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
        <header className="panel__head fixed-home__head">
          <div>
            <h2>이번 달 고정지출·저축</h2>
            <p>예정 내역을 확인하고, 실제 결제 후 반영해 주세요</p>
          </div>
          <button
            type="button"
            className="btn btn--primary fixed-home__action"
            onClick={() => {
              onNavigate('ledger')
              navigateTo()
            }}
          >
            가계부에서 반영 <Icon name="right" size={15} />
          </button>
        </header>
        {fixedItems.length === 0 ? (
          <p className="panel__empty">설정에서 고정지출·저축을 등록해 보세요.</p>
        ) : (
          <>
            <div className="fixed-home__summary">
              <div className="fixed-home__total">
                <strong>{won(fixedTotal)}</strong>
                <span>이번 달 예정 합계</span>
              </div>
              <div className="fixed-home__saving">
                <span>저축 포함</span>
                <strong>{won(fixedSavingsPlanned)}</strong>
              </div>
              <div className="fixed-home__progress">
                <span>반영 현황</span>
                <div className="fixed-home__progress-value">
                  <strong>{fixedRecorded} / {fixedItems.length}건</strong>
                  <div role="progressbar" aria-label="고정지출·저축 반영 현황" aria-valuemin={0} aria-valuemax={fixedItems.length} aria-valuenow={fixedRecorded}>
                    <Progress value={fixedRecorded} max={fixedItems.length} tone="accent" thin />
                  </div>
                </div>
              </div>
            </div>
            {fixedUpcoming.length === 0 ? (
              <p className="fixed-home__done">
                <Icon name="check" size={16} /> 이번 달 고정지출·저축을 모두 반영했어요.
              </p>
            ) : (
              <div className="fixed-home__upcoming">
                <div className="fixed-home__section-head">
                  <h3>다가오는 항목</h3>
                  <span>미반영 내역 중 가까운 {fixedUpcoming.length}건</span>
                </div>
                <ul className="fixed-home__list">
                  {fixedUpcoming.map(({ fixedExpense, dueDate }) => (
                    <li key={fixedExpense.id} className="fixed-home__item">
                      <time dateTime={dueDate}>
                        {Number(dueDate.slice(5, 7))}월 {Number(dueDate.slice(8, 10))}일
                        {isSavingsFixedExpense(fixedExpense) && <span className="fixed-home__tag">저축</span>}
                      </time>
                      <span className="fixed-home__name">{fixedExpense.name}</span>
                      <strong>{won(fixedExpense.amount)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
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
        <div className="card-overview__counts">
          {cardGroups.map((group) => <span key={group.id}>{group.label} {group.items.length}장</span>)}
        </div>
        {cardGroups.filter((group) => group.items.length > 0).map((group) => (
          <section className="card-overview__group" key={group.id} aria-label={group.title}>
            <div className="card-overview__heading">
              <h3>{group.title}</h3>
              <span>{group.id === 'pending' ? '즐겨찾기 먼저 · 남은 금액이 적은 순' : '즐겨찾기 먼저'}</span>
            </div>
            <div className="mini-cards">
              {group.items.map((cardMonth) => {
                const favorite = (state.settings.favoriteCardIds ?? []).includes(cardMonth.card.id)
                return (
                  <article className="mini-card" key={cardMonth.card.id}>
                    <span className="mini-card__stripe" style={{ background: `linear-gradient(135deg, ${cardMonth.card.colorFrom}, ${cardMonth.card.colorTo})` }} />
                    <div className="mini-card__heading">
                      <button
                        type="button"
                        className={`mini-card__favorite${favorite ? ' is-active' : ''}`}
                        aria-label={`${cardMonth.card.name} 즐겨찾기 ${favorite ? '해제' : '추가'}`}
                        aria-pressed={favorite}
                        onClick={() => toggleFavoriteCard(cardMonth.card.id)}
                      >
                        <Icon name={favorite ? 'starFilled' : 'star'} size={17} />
                      </button>
                      <span className="mini-card__name" title={cardMonth.card.name}>{cardMonth.card.name}</span>
                    </div>
                    <span className="mini-card__label">{group.id === 'pending' ? '충족까지' : '이번 달 사용'}</span>
                    <strong className="mini-card__spend">{won(group.id === 'pending' ? cardMonth.toRequirement : cardMonth.spend)}</strong>
                    {group.id !== 'unconditional' && (
                      <>
                        <div className="mini-card__progress">
                          <Progress value={cardMonth.spend} max={cardMonth.card.minSpendForBenefits} tone={group.id === 'pending' ? 'warn' : 'success'} thin />
                        </div>
                        <span className="mini-card__status">{won(cardMonth.spend)} / 목표 {won(cardMonth.card.minSpendForBenefits)}</span>
                      </>
                    )}
                    {group.id === 'complete' && <span className="mini-card__complete"><Icon name="check" size={12} /> 실적 충족</span>}
                    {group.id === 'unconditional' && <span className="mini-card__status">실적 조건 없이 사용</span>}
                    {group.id === 'complete' && cardMonth.nextTierRemaining > 0 && <span className="mini-card__status">다음 구간까지 {won(cardMonth.nextTierRemaining)}</span>}
                    <div className="mini-card__footer"><span>이번 달 받은 혜택</span><strong>{won(cardMonth.totalBenefit)}</strong></div>
                  </article>
                )
              })}
            </div>
          </section>
        ))}
        {cardMonths.length === 0 && <p className="panel__empty">카드 관리에서 사용할 카드를 등록해 주세요.</p>}

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
              const isExcluded = !savings && !isLivingExpense(transaction)
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
                        {savings ? (
                          <Badge tone="success">저축</Badge>
                        ) : isExcluded ? (
                          <Badge tone="accent">실적용</Badge>
                        ) : null}
                      </span>
                      <span className="tx__meta">
                        {savings ? '저축 · 계좌' : `${category.label} · ${cardName(transaction.cardId)}`} ·{' '}
                        {formatDateKo(transaction.date)}
                      </span>
                    </span>
                    <span
                      className={`tx__amount${
                        savings
                          ? ' tx__amount--savings'
                          : isExcluded
                            ? ' tx__amount--excluded'
                            : ''
                      }`}
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
