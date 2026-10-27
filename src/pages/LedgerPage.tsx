import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Badge, EmptyState, MonthPicker } from '../components/ui'
import { CATEGORIES, categoryOf, isSavingsCategory } from '../data/categories'
import { isExcludedFromSpend } from '../lib/analytics'
import { benefitRuleForTransaction } from '../lib/benefits'
import { formatDateKo, formatDateShort, todayISO } from '../lib/date'
import {
  fixedExpenseCandidates,
  fixedExpenseDayLabel,
  fixedExpenseStatus,
  fixedExpensesForMonth,
  fixedExpenseStatusLabel,
  isSavingsFixedExpense,
} from '../lib/fixedExpenses'
import { won, wonShort } from '../lib/format'
import { useApp } from '../store'
import type { FixedExpense, Transaction } from '../types'

type CardFilter = 'all' | 'cash' | string

export function LedgerPage({
  onAdd,
  onEdit,
  onApplyFixedExpense,
  onLinkFixedExpense,
}: {
  onAdd: () => void
  onEdit: (transaction: Transaction) => void
  onApplyFixedExpense: (
    fixedExpense: FixedExpense,
    candidates?: Transaction[],
  ) => void
  onLinkFixedExpense: (fixedExpense: FixedExpense, transactionId: string) => void
}) {
  const {
    state,
    month,
    setMonth,
    fixedExpenses,
    fixedExpenseApplications,
    unlinkedTransactions,
    cloudEnabled,
  } = useApp()
  const [categoryFilter, setCategoryFilter] = useState<'all' | (typeof CATEGORIES)[number]['id']>(
    'all',
  )
  const [cardFilter, setCardFilter] = useState<CardFilter>('all')
  const [query, setQuery] = useState('')
  const [isFixedCollapsed, setIsFixedCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('ssen-ledger-fixed-collapsed') === 'true'
  })

  const toggleFixedCollapsed = () => {
    setIsFixedCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('ssen-ledger-fixed-collapsed', String(next))
      } catch {
        // 무시
      }
      return next
    })
  }

  const paymentMethodLabel = (transaction: Transaction) => {
    if (transaction.cardId) {
      const card = state.cards.find((item) => item.id === transaction.cardId)
      const name = card?.name ?? '카드'
      return transaction.paymentMethod === '간편결제' ? `${name} (간편결제)` : name
    }
    return transaction.paymentMethod || '현금·계좌'
  }

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return state.transactions
      .filter((transaction) => transaction.date.startsWith(month))
      .filter((transaction) =>
        categoryFilter === 'all' ? true : transaction.categoryId === categoryFilter,
      )
      .filter((transaction) => {
        if (cardFilter === 'all') return true
        if (cardFilter === 'simplepay') return transaction.paymentMethod === '간편결제'
        if (cardFilter === 'cash') return transaction.cardId === null
        return transaction.cardId === cardFilter
      })
      .filter((transaction) => {
        if (!keyword) return true
        const categoryLabel = categoryOf(transaction.categoryId).label
        return (
          transaction.merchant.toLowerCase().includes(keyword) ||
          categoryLabel.includes(keyword) ||
          (transaction.memo ?? '').toLowerCase().includes(keyword)
        )
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1
        return a.id < b.id ? 1 : -1
      })
  }, [state.transactions, month, categoryFilter, cardFilter, query])

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const transaction of filtered) {
      const list = map.get(transaction.date) ?? []
      list.push(transaction)
      map.set(transaction.date, list)
    }
    return [...map.entries()]
  }, [filtered])

  const spending = filtered.filter(
    (transaction) => !isSavingsCategory(transaction.categoryId),
  )
  const actualSpending = spending.filter(
    (transaction) => !isExcludedFromSpend(transaction),
  )
  const spendExcluded = spending.filter(
    (transaction) => isExcludedFromSpend(transaction),
  )
  const savings = filtered.filter((transaction) =>
    isSavingsCategory(transaction.categoryId),
  )
  const total = actualSpending.reduce((sum, transaction) => sum + transaction.amount, 0)
  const spendExcludedTotal = spendExcluded.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  )
  const savingsTotal = savings.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  )
  const excludedCount = spending.filter((transaction) => transaction.excluded).length

  const fixedItems = fixedExpensesForMonth(fixedExpenses, month).map(
    (fixedExpense) => ({
      fixedExpense,
      candidates: fixedExpenseCandidates(
        fixedExpense,
        month,
        cloudEnabled ? unlinkedTransactions : state.transactions,
        fixedExpenseApplications,
      ),
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
  const fixedSavingsTotal = fixedItems
    .filter((item) => isSavingsFixedExpense(item.fixedExpense))
    .reduce((sum, item) => sum + item.fixedExpense.amount, 0)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="page-head__eyebrow">LEDGER</p>
          <h1>가계부</h1>
        </div>
        <div className="page-head__actions">
          <MonthPicker month={month} onChange={setMonth} />
          <button type="button" className="btn btn--primary" onClick={onAdd}>
            <Icon name="plus" size={18} />
            내역 추가
          </button>
        </div>
      </header>

      <section className="ledger-summary panel">
        <div>
          <span>총 지출</span>
          <strong>{won(total)}</strong>
        </div>
        <div>
          <span>결제 건수</span>
          <strong>{actualSpending.length}건</strong>
        </div>
        <div>
          <span>건당 평균</span>
          <strong>{won(actualSpending.length ? total / actualSpending.length : 0)}</strong>
        </div>
        {savingsTotal > 0 && (
          <div className="ledger-summary__savings">
            <span>저축</span>
            <strong>{won(savingsTotal)}</strong>
          </div>
        )}
        {spendExcluded.length > 0 && (
          <div>
            <span>지출 제외(실적용)</span>
            <strong>{won(spendExcludedTotal)}</strong>
          </div>
        )}
        {excludedCount > 0 && (
          <div>
            <span>실적 제외</span>
            <strong>{excludedCount}건</strong>
          </div>
        )}
      </section>

      <section className="panel fixed-panel">
        <header
          className={`panel__head panel__head--clickable${
            isFixedCollapsed ? ' panel__head--collapsed' : ''
          }`}
          onClick={toggleFixedCollapsed}
          role="button"
          tabIndex={0}
          aria-expanded={!isFixedCollapsed}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggleFixedCollapsed()
            }
          }}
        >
          <div>
            <h2>
              <Icon name="ledger" size={18} /> 이번 달 고정지출·저축
              <span className="fixed-panel__toggle-icon">
                <Icon
                  name={isFixedCollapsed ? 'chevronDown' : 'chevronUp'}
                  size={16}
                />
              </span>
            </h2>
            <p>
              {isFixedCollapsed
                ? '클릭하면 이번 달 고정지출 상세 목록을 펼칠 수 있어요.'
                : '템플릿은 지출·저축에 잡히지 않아요. 확인 후 반영해 주세요.'}
            </p>
          </div>
          <div className="fixed-panel__summary">
            <strong>{won(fixedTotal)}</strong>
            <span>
              {fixedRecorded}/{fixedItems.length} 반영
              {fixedSavingsTotal > 0
                ? ` · 저축 ${won(fixedSavingsTotal)}`
                : ''}
            </span>
          </div>
        </header>

        {!isFixedCollapsed &&
          (fixedItems.length === 0 ? (
            <EmptyState
              emoji="📌"
              title="이번 달 고정지출·저축이 없어요"
              body="설정에서 고정지출·저축을 등록하면 매월 반영 후보를 보여드려요."
            />
          ) : (
            <ul className="fixed-list">
              {fixedItems.map(
                ({
                  fixedExpense,
                  status,
                  dueDate,
                  application,
                  dDayLabel,
                  candidates,
                }) => {
                  const category = categoryOf(fixedExpense.categoryId)
                  const card = fixedExpense.cardId
                    ? state.cards.find(
                        (item) => item.id === fixedExpense.cardId,
                      )
                    : undefined
                  return (
                    <li className="fixed-row" key={fixedExpense.id}>
                      <span
                        className="fixed-row__icon"
                        style={{ background: `${category.color}18` }}
                      >
                        {category.emoji}
                      </span>
                      <div className="fixed-row__main">
                        <strong>
                          {fixedExpense.name}
                          <Badge
                            tone={
                              status === 'recorded'
                                ? 'success'
                                : status === 'due'
                                  ? 'warn'
                                  : 'neutral'
                            }
                          >
                            {fixedExpenseStatusLabel(status)}
                            {status !== 'recorded' && dDayLabel
                              ? ` · ${dDayLabel}`
                              : ''}
                          </Badge>
                        </strong>
                        <span>
                          매월 {fixedExpenseDayLabel(fixedExpense.dayOfMonth)} ·{' '}
                          {isSavingsFixedExpense(fixedExpense)
                            ? '저축'
                            : category.label}{' '}
                          ·{' '}
                          {card?.name ??
                            fixedExpense.paymentMethod ??
                            '현금·계좌'}
                        </span>
                        <small>
                          {status === 'recorded'
                            ? `${formatDateShort(
                                application?.date ?? dueDate,
                              )} 반영`
                            : `${formatDateShort(dueDate)} 예정`}
                        </small>
                        {status !== 'recorded' && candidates.length > 0 && (
                          <div className="fixed-candidates">
                            <span className="fixed-candidates__title">
                              같은 날짜·금액 거래가 이미 있어요
                            </span>
                            <ul>
                              {candidates.map((candidate) => (
                                <li key={candidate.id}>
                                  <span>
                                    {candidate.merchant} ·{' '}
                                    {categoryOf(candidate.categoryId).label} ·{' '}
                                    {won(candidate.amount)}
                                  </span>
                                  <button
                                    type="button"
                                    className="btn btn--tiny btn--ghost"
                                    onClick={() =>
                                      onLinkFixedExpense(
                                        fixedExpense,
                                        candidate.id,
                                      )
                                    }
                                  >
                                    이 거래 연결
                                  </button>
                                </li>
                              ))}
                            </ul>
                            <small>
                              연결하지 않고 새 거래로 반영할 수도 있어요.
                            </small>
                          </div>
                        )}
                      </div>
                      <div className="fixed-row__side">
                        <strong>{won(fixedExpense.amount)}</strong>
                        {status === 'recorded' ? (
                          <span className="fixed-row__done">
                            <Icon name="check" size={14} /> 완료
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--tiny btn--primary"
                            onClick={() =>
                              onApplyFixedExpense(fixedExpense, candidates)
                            }
                          >
                            반영
                          </button>
                        )}
                      </div>
                    </li>
                  )
                },
              )}
            </ul>
          ))}
      </section>

      <section className="filters panel">
        <div className="search">
          <Icon name="search" size={18} />
          <input
            type="search"
            placeholder="결제·저축처, 카테고리, 메모 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="결제·저축 내역 검색"
          />
        </div>
        <div className="filters__selects">
          <select
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(event.target.value as typeof categoryFilter)
            }
            aria-label="카테고리 필터"
          >
            <option value="all">모든 카테고리</option>
            {CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
          <select
            value={cardFilter}
            onChange={(event) => setCardFilter(event.target.value)}
            aria-label="카드 필터"
          >
            <option value="all">모든 결제수단</option>
            <option value="simplepay">⚡ 간편결제</option>
            <option value="cash">현금·계좌</option>
            {state.cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {groups.length === 0 ? (
        <div className="panel">
          <EmptyState
            emoji="🔍"
            title="조건에 맞는 내역이 없어요"
            body="검색어나 필터를 바꿔보거나 새 결제·저축을 추가해 보세요."
          />
        </div>
      ) : (
        <div className="tx-groups">
          {groups.map(([date, items]) => {
            const daySpend = items
              .filter((transaction) => !isSavingsCategory(transaction.categoryId))
              .reduce((sum, transaction) => sum + transaction.amount, 0)
            const daySavings = items
              .filter((transaction) => isSavingsCategory(transaction.categoryId))
              .reduce((sum, transaction) => sum + transaction.amount, 0)
            return (
              <section className="tx-group" key={date}>
                <header className="tx-group__head">
                  <span>
                    {formatDateKo(date)}
                    <small>{items.length}건</small>
                  </span>
                  <span className="tx-group__sum">
                    <strong>{won(daySpend)}</strong>
                    {daySavings > 0 && (
                      <small className="tx-group__savings">
                        + 저축 {won(daySavings)}
                      </small>
                    )}
                  </span>
                </header>
                <ul className="tx-list panel">
                  {items.map((transaction) => {
                    const category = categoryOf(transaction.categoryId)
                    const savings = isSavingsCategory(transaction.categoryId)
                    const displayName =
                      transaction.merchant?.trim() ||
                      transaction.memo?.trim() ||
                      (savings ? '저축' : category.label)
                    const hasDifferentMemo =
                      Boolean(transaction.memo?.trim() &&
                      transaction.memo.trim() !== displayName)
                    const card = transaction.cardId
                      ? state.cards.find((item) => item.id === transaction.cardId)
                      : undefined
                    const rule = card
                      ? benefitRuleForTransaction(card, transaction)
                      : null
                    const minAmount = rule?.minTransactionAmount
                    const benefitExclusion =
                      !transaction.excluded &&
                      minAmount !== undefined &&
                      transaction.amount < minAmount
                        ? `혜택 제외 · ${wonShort(minAmount)} 미만`
                        : null
                    return (
                      <li key={transaction.id}>
                        <button
                          type="button"
                          className="tx"
                          onClick={() => onEdit(transaction)}
                        >
                          <span
                            className="tx__icon"
                            style={{ background: `${category.color}18` }}
                          >
                            {category.emoji}
                          </span>
                          <span className="tx__main">
                            <span className="tx__merchant">
                              {displayName}
                              {transaction.source === 'seed' && (
                                <Badge tone="warn">테스트</Badge>
                              )}
                              {savings ? (
                                <Badge tone="success">저축</Badge>
                              ) : isExcludedFromSpend(transaction) ? (
                                <Badge tone="accent">지출 제외 · 실적 인정</Badge>
                              ) : (
                                transaction.excluded && (
                                  <Badge tone="neutral">실적 제외</Badge>
                                )
                              )}
                              {benefitExclusion && (
                                <Badge tone="warn">{benefitExclusion}</Badge>
                              )}
                            </span>
                            <span className="tx__meta">
                              {savings
                                ? '저축 · 계좌'
                                : `${category.label} · ${paymentMethodLabel(transaction)}`}
                              {hasDifferentMemo ? ` · ${transaction.memo}` : ''}
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
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
