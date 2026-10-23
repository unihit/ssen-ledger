import { useState } from 'react'
import { CATEGORIES, isSavingsCategory } from '../data/categories'
import { categoryGroupForMajor } from '../lib/fixedExpenses'
import { currentMonth } from '../lib/date'
import { SAVINGS_SHEET } from '../lib/savings'
import { useApp } from '../store'
import type { CategoryId, FixedExpense } from '../types'
import { Icon } from './Icon'
import { Modal } from './ui'

const PAYMENT_METHODS = [
  '자동이체',
  '계좌이체',
  '신용카드',
  '체크카드',
  '간편결제',
  '현금',
  '기타',
]

const MAJOR_OPTIONS = [
  '생활비',
  '투자납입',
  '투자회수',
  '대출차입',
  '대출상환',
  '수입',
  '계좌이체',
]

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `fixed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function toNumber(value: string): number {
  const parsed = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function createDraft(): FixedExpense {
  return {
    id: newId(),
    name: '',
    amount: 0,
    categoryId: 'living',
    categoryMajor: '생활비',
    categoryMinor: '기타',
    categoryGroup: '생활비',
    cardId: null,
    paymentMethod: '자동이체',
    dayOfMonth: 25,
    startMonth: currentMonth(),
    endMonth: undefined,
    memo: '',
    note: '',
    active: true,
  }
}

export function FixedExpenseEditModal({
  fixedExpense,
  onClose,
}: {
  fixedExpense?: FixedExpense
  onClose: () => void
}) {
  const {
    state,
    addFixedExpense,
    updateFixedExpense,
    deleteFixedExpense,
  } = useApp()
  const [draft, setDraft] = useState<FixedExpense>(() =>
    fixedExpense
      ? { ...fixedExpense }
      : createDraft(),
  )
  const [amountInput, setAmountInput] = useState(
    String(fixedExpense?.amount ?? ''),
  )
  const [error, setError] = useState('')
  const savingsDraft = isSavingsCategory(draft.categoryId)

  const patch = (changes: Partial<FixedExpense>) =>
    setDraft((current) => ({ ...current, ...changes }))

  const handleCardChange = (cardId: string) => {
    const card = state.cards.find((item) => item.id === cardId)
    patch({
      cardId: cardId || null,
      paymentMethod: card
        ? card.kind === 'check'
          ? '체크카드'
          : '신용카드'
        : '자동이체',
    })
  }

  const handleSave = () => {
    const name = draft.name.trim()
    const amount = toNumber(amountInput)
    if (!name) {
      setError('고정지출·저축 이름을 입력해 주세요.')
      return
    }
    if (amount <= 0) {
      setError('금액을 입력해 주세요.')
      return
    }
    if (!draft.categoryMinor.trim()) {
      setError('분류 소분류를 입력해 주세요.')
      return
    }

    const savings = isSavingsCategory(draft.categoryId)
    const paymentMethod = savings
      ? ['신용카드', '체크카드', '간편결제'].includes(draft.paymentMethod ?? '')
        ? '자동이체'
        : draft.paymentMethod ?? '자동이체'
      : draft.paymentMethod

    const next: FixedExpense = {
      ...draft,
      name,
      amount,
      categoryMajor: savings
        ? SAVINGS_SHEET.categoryMajor
        : draft.categoryMajor.trim() || '생활비',
      categoryMinor: savings
        ? SAVINGS_SHEET.categoryMinor
        : draft.categoryMinor.trim(),
      categoryGroup: savings
        ? SAVINGS_SHEET.categoryGroup
        : categoryGroupForMajor(draft.categoryMajor.trim() || '생활비'),
      cardId: savings ? null : draft.cardId,
      paymentMethod,
      dayOfMonth: Math.min(31, Math.max(1, Math.round(draft.dayOfMonth))),
      startMonth: draft.startMonth || undefined,
      endMonth: draft.endMonth || undefined,
      memo: draft.memo?.trim() || undefined,
      note: draft.note?.trim() || undefined,
      active: true,
    }

    if (fixedExpense) {
      updateFixedExpense(next)
    } else {
      addFixedExpense(next)
    }
    onClose()
  }

  const handleDelete = () => {
    if (!fixedExpense) return
    if (
      window.confirm(
        `${fixedExpense.name} 고정지출·저축을 목록에서 숨길까요?\n이미 반영된 거래는 그대로 남습니다.`,
      )
    ) {
      deleteFixedExpense(fixedExpense.id)
      onClose()
    }
  }

  return (
    <Modal
      title={fixedExpense ? '고정지출·저축 수정' : '고정지출·저축 등록'}
      subtitle="템플릿은 실제 거래가 아니며, 확인 후 반영해야 지출·저축에 잡혀요."
      onClose={onClose}
      footer={
        <div>
          {error && (
            <p className="form__error modal__error" role="alert">
              {error}
            </p>
          )}
          <div className="modal__actions">
            {fixedExpense ? (
              <button
                type="button"
                className="btn btn--ghost btn--danger"
                onClick={handleDelete}
              >
                <Icon name="trash" size={18} />
                숨기기
              </button>
            ) : (
              <span />
            )}
            <div className="modal__actions-right">
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                취소
              </button>
              <button type="button" className="btn btn--primary" onClick={handleSave}>
                {fixedExpense ? '저장' : '등록'}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className="form">
        <div className="field">
          <label htmlFor="fixed-name">고정지출·저축 이름</label>
          <input
            id="fixed-name"
            type="text"
            placeholder="예: 월세, 보험료, IRP 납입"
            value={draft.name}
            maxLength={60}
            onChange={(event) => {
              patch({ name: event.target.value })
              setError('')
            }}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="fixed-amount">금액 (원)</label>
            <input
              id="fixed-amount"
              inputMode="numeric"
              placeholder="0"
              value={amountInput ? toNumber(amountInput).toLocaleString('ko-KR') : ''}
              onChange={(event) =>
                setAmountInput(event.target.value.replace(/[^\d]/g, '').slice(0, 10))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="fixed-day">매월 반영일</label>
            <select
              id="fixed-day"
              value={draft.dayOfMonth}
              onChange={(event) =>
                patch({ dayOfMonth: Number(event.target.value) })
              }
            >
              {Array.from({ length: 30 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  {day}일
                </option>
              ))}
              <option value={31}>말일</option>
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="fixed-category">앱 카테고리</label>
            <select
              id="fixed-category"
              value={draft.categoryId}
              onChange={(event) => {
                const categoryId = event.target.value as CategoryId
                if (isSavingsCategory(categoryId)) {
                  patch({
                    categoryId,
                    categoryMajor: SAVINGS_SHEET.categoryMajor,
                    categoryMinor: SAVINGS_SHEET.categoryMinor,
                    categoryGroup: SAVINGS_SHEET.categoryGroup,
                    cardId: null,
                    paymentMethod: ['신용카드', '체크카드', '간편결제'].includes(
                      draft.paymentMethod ?? '',
                    )
                      ? '자동이체'
                      : draft.paymentMethod,
                  })
                  return
                }
                if (savingsDraft) {
                  patch({
                    categoryId,
                    categoryMajor: '생활비',
                    categoryMinor: '기타',
                    categoryGroup: '생활비',
                  })
                  return
                }
                patch({ categoryId })
              }}
            >
              {CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.emoji} {category.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="fixed-major">거래유형</label>
            <select
              id="fixed-major"
              value={draft.categoryMajor}
              onChange={(event) => {
                const categoryMajor = event.target.value
                if (categoryMajor === SAVINGS_SHEET.categoryMajor) {
                  patch({
                    categoryMajor,
                    categoryGroup: SAVINGS_SHEET.categoryGroup,
                    categoryId: 'savings',
                    categoryMinor: SAVINGS_SHEET.categoryMinor,
                    cardId: null,
                    paymentMethod: ['신용카드', '체크카드', '간편결제'].includes(
                      draft.paymentMethod ?? '',
                    )
                      ? '자동이체'
                      : draft.paymentMethod,
                  })
                  return
                }
                if (savingsDraft) {
                  patch({
                    categoryMajor,
                    categoryGroup: categoryGroupForMajor(categoryMajor),
                    categoryId: 'etc',
                    categoryMinor: '기타',
                  })
                  return
                }
                patch({
                  categoryMajor,
                  categoryGroup: categoryGroupForMajor(categoryMajor),
                })
              }}
            >
              {MAJOR_OPTIONS.map((major) => (
                <option key={major} value={major}>
                  {major}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="fixed-minor">분류 (소분류)</label>
            <input
              id="fixed-minor"
              type="text"
              placeholder="예: 주거, 보험료, IRP·연금"
              value={draft.categoryMinor}
              onChange={(event) => patch({ categoryMinor: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="fixed-card">결제 카드</label>
            <select
              id="fixed-card"
              value={draft.cardId ?? ''}
              disabled={savingsDraft}
              onChange={(event) => handleCardChange(event.target.value)}
            >
              <option value="">현금·계좌</option>
              {state.cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </select>
            {savingsDraft && (
              <span className="field__hint">
                저축은 카드 실적·혜택과 무관하게 계좌이체로 기록돼요.
              </span>
            )}
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="fixed-method">결제수단</label>
            <select
              id="fixed-method"
              value={draft.paymentMethod ?? '자동이체'}
              onChange={(event) =>
                patch({ paymentMethod: event.target.value })
              }
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="fixed-start">시작월 (선택)</label>
            <input
              id="fixed-start"
              type="month"
              value={draft.startMonth ?? ''}
              onChange={(event) => patch({ startMonth: event.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="fixed-memo">메모 (선택)</label>
          <input
            id="fixed-memo"
            type="text"
            placeholder="예: 매월 자동이체"
            value={draft.memo ?? ''}
            onChange={(event) => patch({ memo: event.target.value })}
          />
        </div>

        <p className="panel__note">
          <Icon name="sparkles" size={14} />
          보험료처럼 실제 결제일이 달라지는 항목은 반영할 때 날짜를 바꾸거나, Agent API로
          거래 날짜를 수정할 수 있어요.
        </p>
      </div>
    </Modal>
  )
}
