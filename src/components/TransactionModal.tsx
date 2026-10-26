import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CATEGORIES, isSavingsCategory } from '../data/categories'
import {
  CARD_PAYMENT_METHODS,
  CASH_PAYMENT_METHODS,
  PAYMENT_METHOD_EMOJI,
  defaultPaymentMethodForCard,
  paymentMethodOptions,
} from '../data/paymentMethods'
import { recommendCards } from '../lib/benefits'
import { findManualDuplicates } from '../lib/duplicates'
import { fixedExpenseDueDate } from '../lib/fixedExpenses'
import { todayISO } from '../lib/date'
import { won } from '../lib/format'
import { SAVINGS_SHEET } from '../lib/savings'
import { useApp } from '../store'
import type { CategoryId, FixedExpense, Transaction } from '../types'
import { Icon } from './Icon'
import { Modal } from './ui'

function defaultDateFor(month: string): string {
  const today = todayISO()
  if (today.startsWith(month)) return today
  return `${month}-15`
}

export function TransactionModal({
  initial,
  fixedExpense,
  candidates = [],
  month,
  onClose,
}: {
  initial?: Transaction
  fixedExpense?: FixedExpense
  candidates?: Transaction[]
  month: string
  onClose: () => void
}) {
  const {
    state,
    addTransaction,
    updateTransaction,
    applyFixedExpense,
    deleteTransaction,
    setMonth,
  } = useApp()
  const startingCategoryId =
    initial?.categoryId ?? fixedExpense?.categoryId ?? 'food'
  const startingSavings = isSavingsCategory(startingCategoryId)
  const [amount, setAmount] = useState(
    initial
      ? String(initial.amount)
      : fixedExpense
        ? String(fixedExpense.amount)
        : '',
  )
  const [merchant, setMerchant] = useState(
    initial?.merchant ?? fixedExpense?.name ?? '',
  )
  const [date, setDate] = useState(
    initial?.date ??
      (fixedExpense
        ? fixedExpenseDueDate(fixedExpense, month)
        : defaultDateFor(month)),
  )
  const [categoryId, setCategoryId] = useState<CategoryId>(startingCategoryId)
  const [cardId, setCardId] = useState<string | null>(
    initial?.cardId ?? fixedExpense?.cardId ?? null,
  )
  const selectedCard = state.cards.find((card) => card.id === cardId)
  const [paymentMethod, setPaymentMethod] = useState<string>(() => {
    if (initial?.paymentMethod) return initial.paymentMethod
    if (fixedExpense?.paymentMethod) return fixedExpense.paymentMethod
    if (startingSavings) return '계좌이체'
    const initCard = state.cards.find(
      (c) => c.id === (initial?.cardId ?? fixedExpense?.cardId),
    )
    return initCard ? defaultPaymentMethodForCard(initCard.kind) : '계좌이체'
  })
  const [memo, setMemo] = useState(initial?.memo ?? fixedExpense?.memo ?? '')
  const [excluded, setExcluded] = useState(
    startingSavings
      ? true
      : (initial?.excluded ??
          (fixedExpense ? fixedExpense.categoryMajor !== '생활비' : false)),
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [duplicates, setDuplicates] = useState<Transaction[]>([])
  const [linkCandidateId, setLinkCandidateId] = useState<string | null>(
    candidates[0]?.id ?? null,
  )
  // 후보가 있어도 기본은 새 거래로 반영한다. 연결은 사용자가 직접 선택한다.
  const [useLinkedCandidate, setUseLinkedCandidate] = useState(false)

  // 날짜·금액·분류를 바꾸면 이전 중복 경고는 더 이상 유효하지 않다.
  useEffect(() => {
    setDuplicates([])
  }, [date, amount, categoryId])

  const numericAmount = Number(amount.replace(/[^\d]/g, '')) || 0
  const savingsCategory = isSavingsCategory(categoryId)
  const categoryLabel =
    CATEGORIES.find((category) => category.id === categoryId)?.label ?? '기타'
  // 날짜·금액이 바뀌면 기존 후보와 더 이상 같은 거래가 아니므로 연결 대상에서 뺀다.
  const matchingCandidates = candidates.filter(
    (candidate) =>
      candidate.date === date &&
      (candidate.effectiveAmount ?? candidate.amount) === numericAmount,
  )
  const effectiveLinkCandidateId =
    matchingCandidates.find((candidate) => candidate.id === linkCandidateId)?.id ??
    matchingCandidates[0]?.id ??
    null
  // 자동이체·계좌이체·현금은 카드가 아니므로 카드 선택·혜택 계산 대상이 아니다.
  const cardApplicable =
    !savingsCategory &&
    (CARD_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)

  const handleCardChange = (nextCardId: string | null) => {
    setCardId(nextCardId)
    if (nextCardId === null) {
      if ((CARD_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
        setPaymentMethod('계좌이체')
      }
    } else {
      const targetCard = state.cards.find((c) => c.id === nextCardId)
      if (paymentMethod === '간편결제') {
        // 간편결제 상태 유지
      } else if (
        (CASH_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)
      ) {
        setPaymentMethod(defaultPaymentMethodForCard(targetCard?.kind))
      } else if (targetCard) {
        setPaymentMethod(defaultPaymentMethodForCard(targetCard.kind))
      }
    }
  }

  const handlePaymentMethodChange = (method: string) => {
    setPaymentMethod(method)
    if (!(CARD_PAYMENT_METHODS as readonly string[]).includes(method)) {
      setCardId(null)
      return
    }
    // 신용/체크가 바뀌면 기존 카드 종류와 맞지 않을 수 있으므로 다시 고르게 한다.
    if (method === '신용카드' && selectedCard?.kind === 'check') {
      setCardId(null)
    } else if (method === '체크카드' && selectedCard?.kind === 'credit') {
      setCardId(null)
    }
  }

  const recommendations = useMemo(
    () =>
      savingsCategory || !cardApplicable
        ? []
        : recommendCards(state.cards, state.transactions, date.slice(0, 7), {
            categoryId,
            amount: numericAmount,
            paymentMethod,
          }),
    [
      state.cards,
      state.transactions,
      date,
      categoryId,
      numericAmount,
      savingsCategory,
      cardApplicable,
      paymentMethod,
    ],
  )

  const best = recommendations[0]
  const selected = recommendations.find((item) => item.card.id === cardId)
  const selectedGain = selected?.gain ?? 0
  const extraGain = best ? Math.max(0, best.gain - selectedGain) : 0

  const handleApplyBest = () => {
    if (!best) return
    setCardId(best.card.id)
    if (best.matchedRule?.paymentMethods?.includes('간편결제')) {
      setPaymentMethod('간편결제')
    } else if (
      paymentMethod === '간편결제' &&
      !best.matchedRule?.paymentMethods?.includes('간편결제')
    ) {
      setPaymentMethod(defaultPaymentMethodForCard(best.card.kind))
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await submit()
  }

  const submit = async (confirmDuplicate = false) => {
    if (saving) return
    if (numericAmount <= 0) {
      setError(savingsCategory ? '저축 금액을 입력해 주세요.' : '결제 금액을 입력해 주세요.')
      return
    }
    if (cardApplicable && !cardId) {
      setError('결제 카드를 선택하거나 결제수단을 계좌이체·현금으로 바꿔 주세요.')
      return
    }
    const effectiveCardId = savingsCategory ? null : cardId
    const effectivePaymentMethod = savingsCategory
      ? '계좌이체'
      : paymentMethod
    const effectiveExcluded = savingsCategory ? true : excluded
    const effectiveMerchant =
      merchant.trim() || (savingsCategory ? '저축' : `${categoryLabel} 결제`)
    const payload = {
      date,
      merchant: effectiveMerchant,
      amount: numericAmount,
      categoryId,
      cardId: effectiveCardId,
      paymentMethod: effectivePaymentMethod,
      memo: memo.trim(),
      excluded: effectiveExcluded,
      ...(savingsCategory ? SAVINGS_SHEET : {}),
    }

    if (fixedExpense) {
      setSaving(true)
      setError('')
      try {
        const result = await applyFixedExpense(fixedExpense, {
          date,
          amount: numericAmount,
          merchant: merchant.trim() || (savingsCategory ? '저축' : fixedExpense.name),
          memo: memo.trim(),
          categoryId,
          cardId: effectiveCardId,
          paymentMethod: effectivePaymentMethod,
          excluded: effectiveExcluded,
          linkTransactionId:
            useLinkedCandidate && effectiveLinkCandidateId
              ? effectiveLinkCandidateId
              : undefined,
        })
        if (!result.ok) {
          setError(result.message)
          return
        }
        setMonth(date.slice(0, 7))
        onClose()
      } finally {
        setSaving(false)
      }
      return
    }

    // 같은 날짜·분류·금액 거래가 이미 있으면 저장 전에 한 번 더 확인한다.
    if (!confirmDuplicate) {
      const matches = findManualDuplicates(
        state.transactions,
        { date, amount: numericAmount, categoryId },
        initial?.id,
      )
      if (matches.length > 0) {
        setDuplicates(matches)
        setError('')
        return
      }
    }

    setDuplicates([])

    if (initial) {
      const preservedSheetFields =
        initial.categoryId === categoryId
          ? {
              categoryMajor: initial.categoryMajor,
              categoryMinor: initial.categoryMinor,
              categoryGroup: initial.categoryGroup,
              correction: initial.correction,
              note: initial.note,
            }
          : {}
      const preservedFixedFields = {
        fixedExpenseId: initial.fixedExpenseId,
        fixedExpenseMonth: initial.fixedExpenseMonth,
      }

      updateTransaction({
        ...payload,
        ...preservedSheetFields,
        ...preservedFixedFields,
        paymentMethod: effectivePaymentMethod,
        id: initial.id,
      })
    } else {
      addTransaction(payload)
    }
    setMonth(date.slice(0, 7))
    onClose()
  }

  const handleDelete = () => {
    if (!initial) return
    const target = isSavingsCategory(initial.categoryId) ? '저축 내역' : '결제 내역'
    if (window.confirm(`${target}을 삭제할까요?`)) {
      deleteTransaction(initial.id)
      onClose()
    }
  }

  return (
    <Modal
      title={
        savingsCategory
          ? fixedExpense
            ? '고정저축 반영'
            : initial
              ? '저축 수정'
              : '저축 추가'
          : fixedExpense
            ? '고정지출 반영'
            : initial
              ? '결제 내역 수정'
              : '결제 추가'
      }
      subtitle={
        savingsCategory
          ? '저축은 생활비 지출과 카드 실적에 잡히지 않아요.'
          : fixedExpense
            ? '내용을 확인한 뒤 반영하면 실제 거래로 기록돼요.'
            : '카드 실적과 혜택이 자동으로 다시 계산돼요.'
      }
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
            <button
              type="submit"
              form="transaction-form"
              className="btn btn--primary"
              disabled={saving}
            >
              {saving
                ? '반영 중…'
                : fixedExpense
                  ? '반영 완료'
                  : initial
                    ? '수정 완료'
                    : savingsCategory
                      ? '저축 저장'
                      : '저장'}
            </button>
          </div>
        </div>
      }
    >
      <form id="transaction-form" className="form" onSubmit={handleSubmit}>
        {fixedExpense && matchingCandidates.length > 0 && (
          <div className="duplicate-panel" role="status">
            <strong>같은 날짜·금액 거래가 이미 있어요</strong>
            <p>
              기존 거래에 연결하면 중복 없이 고정지출로 표시돼요. 연결하지
              않으면 새 거래가 추가돼요.
            </p>
            <label className="duplicate-option">
              <input
                type="radio"
                name="fixed-link-mode"
                checked={useLinkedCandidate}
                onChange={() => setUseLinkedCandidate(true)}
              />
              <span>
                기존 거래에 연결
                <small>금액·날짜·가맹점은 기존 기록을 그대로 둬요.</small>
              </span>
            </label>
            {useLinkedCandidate && (
              <ul className="duplicate-list">
                {matchingCandidates.map((candidate) => (
                  <li key={candidate.id}>
                    <label>
                      <input
                        type="radio"
                        name="fixed-link-target"
                        checked={effectiveLinkCandidateId === candidate.id}
                        onChange={() => setLinkCandidateId(candidate.id)}
                      />
                      <span>
                        {candidate.merchant} · {candidate.date} ·{' '}
                        {won(candidate.amount)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <label className="duplicate-option">
              <input
                type="radio"
                name="fixed-link-mode"
                checked={!useLinkedCandidate}
                onChange={() => setUseLinkedCandidate(false)}
              />
              <span>새 거래로 반영</span>
            </label>
          </div>
        )}

        {duplicates.length > 0 && (
          <div className="duplicate-panel duplicate-panel--warn" role="alert">
            <strong>이미 있는 거래예요</strong>
            <p>같은 날짜·분류·금액의 거래가 이미 있어요. 그래도 저장할까요?</p>
            <ul className="duplicate-list">
              {duplicates.map((duplicate) => (
                <li key={duplicate.id}>
                  <span>
                    {duplicate.merchant} · {duplicate.date} ·{' '}
                    {won(duplicate.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="duplicate-panel__actions">
              <button
                type="button"
                className="btn btn--tiny btn--ghost"
                onClick={() => setDuplicates([])}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn--tiny btn--primary"
                onClick={() => void submit(true)}
              >
                그래도 저장
              </button>
            </div>
          </div>
        )}

        <div className="field field--amount">
          <label htmlFor="tx-amount">{savingsCategory ? '저축 금액' : '결제 금액'}</label>
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

        {numericAmount > 0 && !savingsCategory && best && (
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
                onClick={handleApplyBest}
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
          <label htmlFor="tx-merchant">{savingsCategory ? '저축처' : '결제처'}</label>
          <input
            id="tx-merchant"
            type="text"
            placeholder={savingsCategory ? '예: 청년도약계좌' : '예: 스타벅스 강남점'}
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
                disabled={Boolean(fixedExpense)}
                onClick={() => {
                  setCategoryId(category.id)
                  if (isSavingsCategory(category.id)) {
                    setCardId(null)
                    setExcluded(true)
                  } else if (savingsCategory) {
                    setExcluded(false)
                  }
                }}
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
          {fixedExpense && (
            <span className="field__hint">
              고정지출·저축 카테고리는 설정에서 변경할 수 있어요.
            </span>
          )}
        </div>

        {!savingsCategory && (
          <div className="field">
            <label>결제수단</label>
            <div className="chip-row">
              {paymentMethodOptions(selectedCard, initial?.paymentMethod).map(
                (method) => {
                  const active = paymentMethod === method
                  return (
                    <button
                      key={method}
                      type="button"
                      className={`chip${active ? ' is-active' : ''}`}
                      onClick={() => handlePaymentMethodChange(method)}
                      style={
                        active
                          ? selectedCard
                            ? {
                                borderColor: selectedCard.colorFrom,
                                background: `${selectedCard.colorFrom}14`,
                              }
                            : { borderColor: 'var(--accent)' }
                          : undefined
                      }
                    >
                      <span aria-hidden="true">{PAYMENT_METHOD_EMOJI[method]}</span>
                      {method}
                    </button>
                  )
                },
              )}
            </div>
            <span className="field__hint">
              {!cardApplicable
                ? `${paymentMethod}은(는) 카드가 아니라 카드 실적·혜택 계산에 포함되지 않아요.`
                : cardId === null
                  ? '카드를 선택하면 혜택이 계산돼요.'
                  : '간편결제 혜택(예: MG+ S 10%)은 간편결제를 선택해야 적용돼요.'}
            </span>
          </div>
        )}

        {savingsCategory ? (
          <div className="field">
            <label>결제 카드</label>
            <p className="field__hint">
              저축은 카드 실적·혜택과 무관하게 계좌이체로 기록돼요.
            </p>
          </div>
        ) : cardApplicable ? (
          <div className="field">
            <label>결제 카드</label>
            <div className="chip-row">
              <button
                type="button"
                className={`chip${cardId === null ? ' is-active' : ''}`}
                onClick={() => handleCardChange(null)}
              >
                <Icon name="wallet" size={16} />
                현금·계좌
              </button>
              {state.cards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={`chip${cardId === card.id ? ' is-active' : ''}`}
                  onClick={() => handleCardChange(card.id)}
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
        ) : null}

        <div className="field-row">
          <div className="field">
            <label htmlFor="tx-date">날짜</label>
            <input
              id="tx-date"
              type="date"
              value={date}
              max={fixedExpense ? undefined : todayISO()}
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

        {savingsCategory ? (
          <p className="form__hint">
            저축은 카드 실적과 혜택에 잡히지 않아요. 생활비 지출에도 포함되지 않아요.
          </p>
        ) : (
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
        )}

        {error && <p className="form__error">{error}</p>}
      </form>
    </Modal>
  )
}
