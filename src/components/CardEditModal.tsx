import { useState } from 'react'
import { CATEGORIES, categoryOf } from '../data/categories'
import { useApp } from '../store'
import type { Card, CategoryId, PerformanceTier } from '../types'
import { Icon } from './Icon'
import { Modal } from './ui'

const CARD_THEMES = [
  { label: '블루', from: '#4f8cff', to: '#1f5ae0' },
  { label: '바이올렛', from: '#7c5cff', to: '#4b2ed6' },
  { label: '민트', from: '#19b8a6', to: '#0b7f7a' },
  { label: '로즈', from: '#fb7185', to: '#e11d48' },
  { label: '앰버', from: '#f59e0b', to: '#d97706' },
  { label: '네이비', from: '#334155', to: '#0f172a' },
  { label: '차콜', from: '#64748b', to: '#334155' },
]

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function cloneCard(card: Card): Card {
  return {
    ...card,
    benefits: card.benefits.map((rule) => ({ ...rule })),
    performanceTiers: card.performanceTiers?.map((tier) => ({ ...tier })) ?? [],
  }
}

function createDraft(): Card {
  return {
    id: makeId('card'),
    name: '',
    issuer: '',
    kind: 'credit',
    colorFrom: CARD_THEMES[0].from,
    colorTo: CARD_THEMES[0].to,
    minSpendForBenefits: 300_000,
    monthlyTotalCap: 30_000,
    performanceTiers: [],
    baseRate: 0,
    baseCap: 0,
    benefits: [],
    active: true,
  }
}

function toNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export function CardEditModal({ card, onClose }: { card?: Card; onClose: () => void }) {
  const { state, addCard, updateCard, deleteCard } = useApp()
  const [draft, setDraft] = useState<Card>(() => (card ? cloneCard(card) : createDraft()))
  const [newCategory, setNewCategory] = useState<CategoryId>(CATEGORIES[0].id)
  const [error, setError] = useState('')

  const isEdit = Boolean(card)
  const availableCategories = CATEGORIES.filter(
    (category) => !draft.benefits.some((rule) => rule.categoryId === category.id),
  )
  const selectedNewCategory =
    availableCategories.find((category) => category.id === newCategory)?.id ??
    availableCategories[0]?.id

  const patch = (changes: Partial<Card>) => setDraft((current) => ({ ...current, ...changes }))

  const patchRule = (id: string, changes: Record<string, number>) => {
    setDraft((current) => ({
      ...current,
      benefits: current.benefits.map((rule) =>
        rule.id === id ? { ...rule, ...changes } : rule,
      ),
    }))
  }

  const patchTier = (index: number, changes: Partial<PerformanceTier>) => {
    setDraft((current) => ({
      ...current,
      performanceTiers: (current.performanceTiers ?? []).map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, ...changes } : tier,
      ),
    }))
  }

  const handleAddTier = () => {
    setDraft((current) => {
      const tiers = current.performanceTiers ?? []
      const last = tiers[tiers.length - 1]
      return {
        ...current,
        performanceTiers: [
          ...tiers,
          {
            minSpend: last
              ? last.minSpend + 300_000
              : Math.max(300_000, current.minSpendForBenefits),
            monthlyTotalCap: last ? last.monthlyTotalCap : current.monthlyTotalCap,
          },
        ],
      }
    })
  }

  const handleRemoveTier = (index: number) => {
    setDraft((current) => ({
      ...current,
      performanceTiers: (current.performanceTiers ?? []).filter(
        (_, tierIndex) => tierIndex !== index,
      ),
    }))
  }

  const handleAddRule = () => {
    if (!selectedNewCategory) return
    setError('')
    setDraft((current) => ({
      ...current,
      benefits: [
        ...current.benefits,
        {
          id: makeId('rule'),
          categoryId: selectedNewCategory,
          rate: 0.05,
          monthlyCap: 5_000,
        },
      ],
    }))
  }

  const handleRemoveRule = (id: string) => {
    setError('')
    setDraft((current) => ({
      ...current,
      benefits: current.benefits.filter((rule) => rule.id !== id),
    }))
  }

  const handleSave = () => {
    if (!draft.name.trim()) {
      setError('카드 이름을 입력해 주세요.')
      return
    }
    if (draft.baseRate <= 0 && draft.benefits.length === 0) {
      setError('혜택 카테고리를 하나 이상 추가하거나 기본 적립률을 입력해 주세요.')
      return
    }

    const tierMap = new Map<number, PerformanceTier>()
    for (const tier of draft.performanceTiers ?? []) {
      const minSpend = Math.max(0, Math.round(tier.minSpend))
      if (minSpend <= 0) continue
      tierMap.set(minSpend, {
        minSpend,
        monthlyTotalCap: Math.max(0, Math.round(tier.monthlyTotalCap)),
      })
    }
    const performanceTiers = [...tierMap.values()].sort(
      (a, b) => a.minSpend - b.minSpend,
    )

    const next: Card = {
      ...draft,
      name: draft.name.trim(),
      issuer: draft.issuer.trim() || '내 카드',
      baseRate: Math.max(0, draft.baseRate),
      minSpendForBenefits: Math.max(0, Math.round(draft.minSpendForBenefits)),
      monthlyTotalCap: Math.max(0, Math.round(draft.monthlyTotalCap)),
      performanceTiers,
      baseCap: Math.max(0, Math.round(draft.baseCap)),
      benefits: draft.benefits.map((rule) => ({
        ...rule,
        rate: Math.max(0, rule.rate),
        monthlyCap: Math.max(0, Math.round(rule.monthlyCap)),
        minSpend: rule.minSpend ? Math.max(0, Math.round(rule.minSpend)) : undefined,
      })),
    }

    if (card) {
      updateCard(next)
    } else {
      addCard(next)
    }
    onClose()
  }

  const handleDelete = () => {
    if (!card) return
    const usedCount = state.transactions.filter(
      (transaction) => transaction.cardId === card.id,
    ).length
    if (usedCount > 0) {
      setError(
        `이 카드로 결제한 내역이 ${usedCount}건 있어 삭제할 수 없어요. 카드를 숨기거나 결제 내역의 카드를 먼저 바꿔주세요.`,
      )
      return
    }
    if (window.confirm(`${card.name} 카드를 삭제할까요?`)) {
      deleteCard(card.id)
      onClose()
    }
  }

  return (
    <Modal
      title={isEdit ? '카드 정보 수정' : '카드 등록'}
      subtitle={
        isEdit
          ? '카드 이름·디자인과 혜택 조건을 바꿀 수 있어요.'
          : '내 카드의 이름과 혜택 조건을 직접 등록해 보세요.'
      }
      onClose={onClose}
      footer={
        <div>
          {error && (
            <p className="form__error modal__error" role="alert">
              {error}
            </p>
          )}
          <div className="modal__actions">
            {card ? (
              <button
                type="button"
                className="btn btn--ghost btn--danger"
                onClick={handleDelete}
              >
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
              <button type="button" className="btn btn--primary" onClick={handleSave}>
                {isEdit ? '저장' : '카드 등록'}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className="form">
        <div
          className="card-visual card-editor__preview"
          style={{
            background: `linear-gradient(135deg, ${draft.colorFrom}, ${draft.colorTo})`,
          }}
        >
          <div className="card-visual__top">
            <span>{draft.issuer.trim() || '카드사'}</span>
            <span>{draft.kind === 'check' ? 'CHECK' : 'CREDIT'}</span>
          </div>
          <span className="card-visual__name">{draft.name.trim() || '새 카드'}</span>
          <div className="card-visual__bottom">
            <span>•••• 2026</span>
            <span>사용 중</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="card-name">카드 이름</label>
          <input
            id="card-name"
            type="text"
            value={draft.name}
            maxLength={24}
            placeholder="예: 나의 생활 카드"
            onChange={(event) => {
              patch({ name: event.target.value })
              setError('')
            }}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="card-issuer">카드사</label>
            <input
              id="card-issuer"
              type="text"
              value={draft.issuer}
              maxLength={16}
              placeholder="예: KB국민카드"
              onChange={(event) => patch({ issuer: event.target.value })}
            />
          </div>
          <div className="field">
            <label>카드 종류</label>
            <div className="chip-row kind-chips">
              <button
                type="button"
                className={`chip${draft.kind === 'credit' ? ' is-active' : ''}`}
                onClick={() => patch({ kind: 'credit' })}
                aria-pressed={draft.kind === 'credit'}
              >
                신용카드
              </button>
              <button
                type="button"
                className={`chip${draft.kind === 'check' ? ' is-active' : ''}`}
                onClick={() => patch({ kind: 'check' })}
                aria-pressed={draft.kind === 'check'}
              >
                체크카드
              </button>
            </div>
          </div>
        </div>

        <div className="field">
          <label>카드 색상</label>
          <div className="color-swatches">
            {CARD_THEMES.map((theme) => {
              const selected =
                draft.colorFrom === theme.from && draft.colorTo === theme.to
              return (
                <button
                  key={theme.label}
                  type="button"
                  className={`color-swatch${selected ? ' is-active' : ''}`}
                  style={{
                    background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`,
                  }}
                  onClick={() => patch({ colorFrom: theme.from, colorTo: theme.to })}
                  aria-label={`${theme.label} 색상`}
                  aria-pressed={selected}
                  title={theme.label}
                >
                  {selected && <Icon name="check" size={15} />}
                </button>
              )
            })}
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="card-min">전월 실적 기준 (원)</label>
            <input
              id="card-min"
              type="number"
              min={0}
              step={10000}
              value={draft.minSpendForBenefits}
              onChange={(event) =>
                patch({ minSpendForBenefits: toNumber(event.target.value) })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="card-cap">기본 월 통합 한도 (원)</label>
            <input
              id="card-cap"
              type="number"
              min={0}
              step={5000}
              value={draft.monthlyTotalCap}
              onChange={(event) => patch({ monthlyTotalCap: toNumber(event.target.value) })}
            />
          </div>
        </div>

        <div className="field">
          <label>전월 실적별 통합 한도</label>
          <p className="tier-editor__hint">
            전월 실적 구간에 따라 이번 달 통합 한도가 달라지는 카드에 사용해요. 예: 30만원
            → 1.5만원, 60만원 → 3만원, 100만원 → 6만원. 구간에 해당하지 않으면 위의 기본
            한도를 사용해요.
          </p>
          <div className="tier-editor">
            {(draft.performanceTiers ?? []).length > 0 && (
              <>
                <div className="tier-editor__head">
                  <span>전월 실적(원)</span>
                  <span>통합 한도(원)</span>
                  <span aria-hidden="true" />
                </div>
                {(draft.performanceTiers ?? []).map((tier, index) => (
                  <div className="tier-editor__row" key={`${tier.minSpend}-${index}`}>
                    <input
                      type="number"
                      min={0}
                      step={10000}
                      value={tier.minSpend}
                      onChange={(event) =>
                        patchTier(index, { minSpend: toNumber(event.target.value) })
                      }
                      aria-label={`${index + 1}번째 구간 전월 실적`}
                    />
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={tier.monthlyTotalCap}
                      onChange={(event) =>
                        patchTier(index, {
                          monthlyTotalCap: toNumber(event.target.value),
                        })
                      }
                      aria-label={`${index + 1}번째 구간 통합 한도`}
                    />
                    <button
                      type="button"
                      className="rule-editor__remove"
                      onClick={() => handleRemoveTier(index)}
                      aria-label={`${index + 1}번째 구간 삭제`}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </>
            )}
            <button
              type="button"
              className="btn btn--ghost btn--sm tier-editor__add"
              onClick={handleAddTier}
            >
              <Icon name="plus" size={16} />
              구간 추가
            </button>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="card-base">기본 적립률 (%)</label>
            <input
              id="card-base"
              type="number"
              min={0}
              step={0.1}
              value={Number((draft.baseRate * 100).toFixed(2))}
              onChange={(event) => patch({ baseRate: toNumber(event.target.value) / 100 })}
            />
          </div>
          <div className="field">
            <label htmlFor="card-base-cap">기본 적립 한도 (원)</label>
            <input
              id="card-base-cap"
              type="number"
              min={0}
              step={1000}
              value={draft.baseCap}
              onChange={(event) => patch({ baseCap: toNumber(event.target.value) })}
            />
          </div>
        </div>

        <div className="field">
          <label>카테고리별 혜택</label>
          <div className="rule-editor">
            {draft.benefits.length === 0 ? (
              <p className="rule-editor__empty">
                아직 등록된 혜택이 없어요. 아래에서 카테고리를 추가해 보세요.
              </p>
            ) : (
              <>
                <div className="rule-editor__head">
                  <span>카테고리</span>
                  <span>적립률(%)</span>
                  <span>월 한도(원)</span>
                  <span aria-hidden="true" />
                </div>
                {draft.benefits.map((rule) => (
                  <div className="rule-editor__row" key={rule.id}>
                    <span className="rule-editor__name" title={rule.note || undefined}>
                      {categoryOf(rule.categoryId).emoji} {categoryOf(rule.categoryId).label}
                      {rule.minSpend ? (
                        <small>{rule.minSpend.toLocaleString('ko-KR')}원 이상 실적</small>
                      ) : null}
                      {rule.minTransactionAmount ? (
                        <small>
                          건당 {rule.minTransactionAmount.toLocaleString('ko-KR')}원 이상
                        </small>
                      ) : null}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={Number((rule.rate * 100).toFixed(2))}
                      onChange={(event) =>
                        patchRule(rule.id, { rate: toNumber(event.target.value) / 100 })
                      }
                      aria-label={`${categoryOf(rule.categoryId).label} 적립률`}
                    />
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={rule.monthlyCap}
                      onChange={(event) =>
                        patchRule(rule.id, { monthlyCap: toNumber(event.target.value) })
                      }
                      aria-label={`${categoryOf(rule.categoryId).label} 월 한도`}
                    />
                    <button
                      type="button"
                      className="rule-editor__remove"
                      onClick={() => handleRemoveRule(rule.id)}
                      aria-label={`${categoryOf(rule.categoryId).label} 혜택 삭제`}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="rule-editor__add">
            <select
              value={selectedNewCategory ?? ''}
              onChange={(event) => setNewCategory(event.target.value as CategoryId)}
              disabled={availableCategories.length === 0}
              aria-label="추가할 혜택 카테고리"
            >
              {availableCategories.length === 0 ? (
                <option value="">모든 카테고리 추가됨</option>
              ) : (
                availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.emoji} {category.label}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={handleAddRule}
              disabled={!selectedNewCategory}
            >
              <Icon name="plus" size={16} />
              혜택 추가
            </button>
          </div>
        </div>

        <p className="form__hint">
          <Icon name="sparkles" size={15} />
          카드 이름·디자인·실적·혜택을 직접 등록할 수 있어요. 표시된 혜택은 실제 약관과
          다를 수 있으니 카드사 최신 조건을 확인해 주세요.
        </p>
      </div>
    </Modal>
  )
}
