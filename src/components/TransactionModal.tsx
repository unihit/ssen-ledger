import { useMemo, useState, type FormEvent } from 'react'
import { CATEGORIES } from '../data/categories'
import { recommendCards } from '../lib/benefits'
import { todayISO } from '../lib/date'
import { won } from '../lib/format'
import { useApp } from '../store'
import type { CategoryId, Transaction } from '../types'
import { Icon } from './Icon'
import { Modal } from './ui'

function defaultDateFor(month: string): string {
  const today = todayISO()
  if (today.startsWith(month)) return today
  return `${month}-15`
}

export function TransactionModal({
  initial,
  month,
  onClose,
}: {
  initial?: Transaction
  month: string
  onClose: () => void
}) {
  const { state, addTransaction, updateTransaction, deleteTransaction, setMonth } = useApp()
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [merchant, setMerchant] = useState(initial?.merchant ?? '')
  const [date, setDate] = useState(initial?.date ?? defaultDateFor(month))
  const [categoryId, setCategoryId] = useState<CategoryId>(initial?.categoryId ?? 'food')
  const [cardId, setCardId] = useState<string | null>(initial?.cardId ?? null)
  const [memo, setMemo] = useState(initial?.memo ?? '')
  const [excluded, setExcluded] = useState(initial?.excluded ?? false)
  const [error, setError] = useState('')

  const numericAmount = Number(amount.replace(/[^\d]/g, '')) || 0

  const recommendations = useMemo(
    () =>
      recommendCards(state.cards, state.transactions, date.slice(0, 7), {
        categoryId,
        amount: numericAmount,
      }),
    [state.cards, state.transactions, date, categoryId, numericAmount],
  )

  const best = recommendations[0]
  const selected = recommendations.find((item) => item.card.id === cardId)
  const selectedGain = selected?.gain ?? 0
  const extraGain = best ? Math.max(0, best.gain - selectedGain) : 0

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (numericAmount <= 0) {
      setError('결제 금액을 입력해 주세요.')
      return
    }
    const payload = {
      date,
      merchant: merchant.trim() || `${CATEGORIES.find((c) => c.id === categoryId)?.label ?? '기타'} 결제`,
      amount: numericAmount,
      categoryId,
      cardId,
      memo: memo.trim(),
      excluded,
    }
    if (initial) {
      const preservedSheetFields =
        initial.categoryId === categoryId
          ? {
              categoryMajor: initial.categoryMajor,
              categoryMinor: initial.categoryMinor,
              categoryGroup: initial.categoryGroup,
              correction: initial.correction,
              note: initial.note,
              paymentMethod:
                initial.cardId === cardId ? initial.paymentMethod : undefined,
            }
          : {}

      updateTransaction({ ...payload, ...preservedSheetFields, id: initial.id })
    } else {
      addTransaction(payload)
    }
    setMonth(date.slice(0, 7))
    onClose()
  }

  const handleDelete = () => {
    if (!initial) return
    if (window.confirm('이 결제 내역을 삭제할까요?')) {
      deleteTransaction(initial.id)
      onClose()
    }
  }

  return (
    <Modal
      title={initial ? '결제 내역 수정' : '결제 추가'}
      subtitle="카드 실적과 혜택이 자동으로 다시 계산돼요."
      onClose={onClose}
      footer={
        <div className="modal__actions">
          {initial ? (
            <button type="button" className="btn btn--ghost btn--danger" onClick={handleDelete}>
              <Icon name="trash" size={18} />
              삭제
            </button>
          ) : (
            <span />
          )}
          <div className="modal__actions-right">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              취소
            </button>
            <button type="submit" form="transaction-form" className="btn btn--primary">
              {initial ? '수정 완료' : '저장'}
            </button>
          </div>
        </div>
      }
    >
      <form id="transaction-form" className="form" onSubmit={handleSubmit}>
        <div className="field field--amount">
          <label htmlFor="tx-amount">결제 금액</label>
          <div className="amount-input">
            <input
              id="tx-amount"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={numericAmount ? numericAmount.toLocaleString('ko-KR') : ''}
              onChange={(event) =>
                setAmount(event.target.value.replace(/[^\d]/g, '').slice(0, 10))
              }
            />
            <span>원</span>
          </div>
        </div>

        {numericAmount > 0 && best && (
          <div className={`recommend${cardId === best.card.id ? ' recommend--matched' : ''}`}>
            <span className="recommend__icon">
              <Icon name="sparkles" size={18} />
            </span>
            <div className="recommend__body">
              <span className="recommend__eyebrow">쎈 추천 · 예상 혜택 {won(best.gain)}</span>
              <strong>{best.card.name}</strong>
              <p>{best.reason}</p>
            </div>
            {cardId !== best.card.id ? (
              <button
                type="button"
                className="btn btn--tiny btn--primary"
                onClick={() => setCardId(best.card.id)}
              >
                {extraGain > 0 ? `+${won(extraGain)}` : '적용'}
              </button>
            ) : (
              <span className="recommend__check">
                <Icon name="check" size={18} />
              </span>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="tx-merchant">결제처</label>
          <input
            id="tx-merchant"
            type="text"
            placeholder="예: 스타벅스 강남점"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
          />
        </div>

        <div className="field">
          <label>카테고리</label>
          <div className="chip-grid">
            {CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`chip chip--category${
                  categoryId === category.id ? ' is-active' : ''
                }`}
                onClick={() => setCategoryId(category.id)}
                style={
                  categoryId === category.id
                    ? { borderColor: category.color, background: `${category.color}14` }
                    : undefined
                }
              >
                <span>{category.emoji}</span>
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>결제 카드</label>
          <div className="chip-row">
            <button
              type="button"
              className={`chip${cardId === null ? ' is-active' : ''}`}
              onClick={() => setCardId(null)}
            >
              <Icon name="wallet" size={16} />
              현금·계좌
            </button>
            {state.cards.map((card) => (
              <button
                key={card.id}
                type="button"
                className={`chip${cardId === card.id ? ' is-active' : ''}`}
                onClick={() => setCardId(card.id)}
                style={
                  cardId === card.id
                    ? { borderColor: card.colorFrom, background: `${card.colorFrom}14` }
                    : undefined
                }
              >
                <span
                  className="chip__dot"
                  style={{ background: `linear-gradient(135deg, ${card.colorFrom}, ${card.colorTo})` }}
                />
                {card.name}
                {!card.active && ' (숨김)'}
              </button>
            ))}
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="tx-date">날짜</label>
            <input
              id="tx-date"
              type="date"
              value={date}
              max={todayISO()}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="tx-memo">메모 (선택)</label>
            <input
              id="tx-memo"
              type="text"
              placeholder="예: 팀 회식"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
          </div>
        </div>

        <label className="switch-row">
          <span>
            실적·혜택 계산에서 제외
            <small>보험료, 상품권, 세금처럼 실적에 안 잡히는 결제</small>
          </span>
          <input
            type="checkbox"
            checked={excluded}
            onChange={(event) => setExcluded(event.target.checked)}
          />
          <span className="switch" aria-hidden="true" />
        </label>

        {error && <p className="form__error">{error}</p>}
      </form>
    </Modal>
  )
}
