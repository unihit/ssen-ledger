import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Badge, EmptyState, MonthPicker } from '../components/ui'
import { CATEGORIES, categoryOf } from '../data/categories'
import { formatDateKo } from '../lib/date'
import { won } from '../lib/format'
import { useApp } from '../store'
import type { Transaction } from '../types'

type CardFilter = 'all' | 'cash' | string

export function LedgerPage({
  onAdd,
  onEdit,
}: {
  onAdd: () => void
  onEdit: (transaction: Transaction) => void
}) {
  const { state, month, setMonth } = useApp()
  const [categoryFilter, setCategoryFilter] = useState<'all' | (typeof CATEGORIES)[number]['id']>(
    'all',
  )
  const [cardFilter, setCardFilter] = useState<CardFilter>('all')
  const [query, setQuery] = useState('')

  const cardName = (id: string | null) =>
    id ? state.cards.find((card) => card.id === id)?.name ?? '카드' : '현금·계좌'

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return state.transactions
      .filter((transaction) => transaction.date.startsWith(month))
      .filter((transaction) =>
        categoryFilter === 'all' ? true : transaction.categoryId === categoryFilter,
      )
      .filter((transaction) => {
        if (cardFilter === 'all') return true
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

  const total = filtered.reduce((sum, transaction) => sum + transaction.amount, 0)
  const excludedCount = filtered.filter((transaction) => transaction.excluded).length

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
            결제 추가
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
          <strong>{filtered.length}건</strong>
        </div>
        <div>
          <span>건당 평균</span>
          <strong>{won(filtered.length ? total / filtered.length : 0)}</strong>
        </div>
        {excludedCount > 0 && (
          <div>
            <span>실적 제외</span>
            <strong>{excludedCount}건</strong>
          </div>
        )}
      </section>

      <section className="filters panel">
        <div className="search">
          <Icon name="search" size={18} />
          <input
            type="search"
            placeholder="결제처, 카테고리, 메모 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="결제 내역 검색"
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
            title="조건에 맞는 결제가 없어요"
            body="검색어나 필터를 바꿔보거나 새 결제를 추가해 보세요."
          />
        </div>
      ) : (
        <div className="tx-groups">
          {groups.map(([date, items]) => {
            const dayTotal = items.reduce((sum, transaction) => sum + transaction.amount, 0)
            return (
              <section className="tx-group" key={date}>
                <header className="tx-group__head">
                  <span>
                    {formatDateKo(date)}
                    <small>{items.length}건</small>
                  </span>
                  <strong>{won(dayTotal)}</strong>
                </header>
                <ul className="tx-list panel">
                  {items.map((transaction) => {
                    const category = categoryOf(transaction.categoryId)
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
                              {transaction.merchant}
                              {transaction.excluded && <Badge tone="neutral">실적 제외</Badge>}
                            </span>
                            <span className="tx__meta">
                              {category.label} · {cardName(transaction.cardId)}
                              {transaction.memo ? ` · ${transaction.memo}` : ''}
                            </span>
                          </span>
                          <span className="tx__amount">{won(transaction.amount)}</span>
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
