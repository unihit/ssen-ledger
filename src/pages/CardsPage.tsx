import { useMemo, useState } from 'react'
import { CardEditModal } from '../components/CardEditModal'
import { Icon } from '../components/Icon'
import { Badge, EmptyState, Progress } from '../components/ui'
import { CATEGORIES, categoryOf } from '../data/categories'
import { computeCardMonth, recommendCards } from '../lib/benefits'
import { ratePercent, won } from '../lib/format'
import { useApp } from '../store'
import type { Card, CategoryId } from '../types'

export function CardsPage() {
  const { state, month, toggleCard } = useApp()
  const [recCategory, setRecCategory] = useState<CategoryId>('food')
  const [recAmount, setRecAmount] = useState('30000')
  const [editor, setEditor] = useState<{ card?: Card } | null>(null)

  const numericAmount = Number(recAmount.replace(/[^\d]/g, '')) || 0
  const recommendations = useMemo(
    () =>
      recommendCards(state.cards, state.transactions, month, {
        categoryId: recCategory,
        amount: numericAmount,
      }),
    [state.cards, state.transactions, month, recCategory, numericAmount],
  )

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="page-head__eyebrow">CARDS</p>
          <h1>카드</h1>
        </div>
        <div className="page-head__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setEditor({})}
          >
            <Icon name="plus" size={18} />
            카드 등록
          </button>
        </div>
      </header>

      <section className="panel recommender">
        <header className="panel__head">
          <div>
            <h2>
              <Icon name="sparkles" size={19} /> 결제 전, 가장 쎈 카드
            </h2>
            <p>실적과 남은 한도까지 계산해서 추천해요</p>
          </div>
        </header>

        <div className="recommender__form">
          <select
            value={recCategory}
            onChange={(event) => setRecCategory(event.target.value as CategoryId)}
            aria-label="결제 카테고리"
          >
            {CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.emoji} {category.label}
              </option>
            ))}
          </select>
          <div className="amount-input amount-input--compact">
            <input
              inputMode="numeric"
              value={numericAmount ? numericAmount.toLocaleString('ko-KR') : ''}
              onChange={(event) =>
                setRecAmount(event.target.value.replace(/[^\d]/g, '').slice(0, 10))
              }
              aria-label="결제 예정 금액"
              placeholder="0"
            />
            <span>원</span>
          </div>
        </div>

        {numericAmount > 0 && recommendations.length > 0 ? (
          <ol className="rec-list">
            {recommendations.slice(0, 3).map((recommendation, index) => (
              <li
                className={`rec-row${index === 0 ? ' is-best' : ''}`}
                key={recommendation.card.id}
              >
                <span className="rec-row__rank">{index + 1}</span>
                <span
                  className="rec-row__dot"
                  style={{
                    background: `linear-gradient(135deg, ${recommendation.card.colorFrom}, ${recommendation.card.colorTo})`,
                  }}
                />
                <div className="rec-row__main">
                  <strong>
                    {recommendation.card.name}
                    {index === 0 && <Badge tone="accent">1순위</Badge>}
                  </strong>
                  <p>{recommendation.reason}</p>
                </div>
                <span className="rec-row__gain">
                  {recommendation.gain > 0 ? `+${won(recommendation.gain)}` : '-'}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="recommender__hint">
            {numericAmount > 0
              ? '사용 중인 카드가 없어요. 카드를 등록하거나 숨긴 카드를 다시 사용해 주세요.'
              : '금액을 입력하면 카드별 예상 혜택을 비교해드려요.'}
          </p>
        )}

        <p className="panel__note">
          <Icon name="sparkles" size={14} />
          전월 실적이 기준을 넘어야 이번 달 혜택이 적용돼요. 조건은 아래 카드에서 직접 수정할 수
          있어요.
        </p>
      </section>

      {state.cards.length === 0 ? (
        <section className="panel">
          <EmptyState
            emoji="💳"
            title="등록된 카드가 없어요"
            body="카드 등록 버튼으로 내 카드를 추가하고 혜택 조건을 설정해 보세요."
          />
        </section>
      ) : (
        <div className="cards-grid">
          {state.cards.map((card) => {
          const cardMonth = computeCardMonth(card, state.transactions, month)
          const usageMap = new Map(cardMonth.rows.map((row) => [row.rule.id, row]))
          const target = card.minSpendForBenefits
          const met = cardMonth.toRequirement <= 0
          const tier = cardMonth.performanceTier
          const tierRate = tier && tier.minSpend > 0 ? tier.monthlyTotalCap / tier.minSpend : null

          return (
            <article
              className={`panel card-panel${card.active ? '' : ' is-inactive'}`}
              key={card.id}
            >
              <div
                className="card-visual"
                style={{
                  background: `linear-gradient(135deg, ${card.colorFrom}, ${card.colorTo})`,
                }}
              >
                <div className="card-visual__top">
                  <span>{card.issuer}</span>
                  <span>{card.kind === 'check' ? 'CHECK' : 'CREDIT'}</span>
                </div>
                <span className="card-visual__name">{card.name}</span>
                <div className="card-visual__bottom">
                  <span>•••• 2026</span>
                  <span>{card.active ? '사용 중' : '숨김'}</span>
                </div>
                {!card.active && <span className="card-visual__off">사용 안 함</span>}
              </div>

              <div className="card-panel__body">
                <div className="card-panel__status">
                  <Badge tone={cardMonth.performanceMet ? 'success' : 'warn'}>
                    {cardMonth.performanceMet ? '전월 실적 충족' : '전월 실적 미달'}
                  </Badge>
                  <span>
                    전월 {won(cardMonth.prevSpend)}
                    {cardMonth.performanceTier
                      ? ` · ${won(cardMonth.performanceTier.minSpend)} 이상 구간`
                      : ''}
                  </span>
                </div>

                <div className="metrics">
                  <div>
                    <span>이번 달 결제</span>
                    <strong>{won(cardMonth.spend)}</strong>
                  </div>
                  <div>
                    <span>받은 혜택</span>
                    <strong className="accent">{won(cardMonth.totalBenefit)}</strong>
                  </div>
                  <div>
                    <span>실질 혜택률</span>
                    <strong>{ratePercent(cardMonth.effectiveRate)}</strong>
                  </div>
                </div>

                {tier && tierRate !== null && (
                  <p
                    className="card-panel__tier-note"
                    title="전월 실적 구간의 기준 금액을 혜택 대상 결제로 채웠을 때의 실질 혜택률(피킹률)이에요. 실제 혜택률은 이번 달 결제와 한도에 따라 달라집니다."
                  >
                    이 구간 통합 한도 {won(tier.monthlyTotalCap)} ·{' '}
                    <strong>구간 기준 {ratePercent(tierRate)}</strong>
                  </p>
                )}

                <div className="card-panel__block">
                  <div className="card-panel__row">
                    <span>
                      {target === 0
                        ? '실적 조건 없음'
                        : met
                          ? '다음 달 혜택 기준 충족'
                          : `다음 달 혜택까지 ${won(cardMonth.toRequirement)}`}
                    </span>
                    <span>
                      {won(cardMonth.spend)} / {target === 0 ? '-' : won(target)}
                    </span>
                  </div>
                  <Progress
                    value={cardMonth.spend}
                    max={target || 1}
                    tone={met ? 'success' : 'warn'}
                    thin
                  />
                </div>

                <div className="card-panel__block">
                  <div className="card-panel__row">
                    <span>이번 달 혜택 사용</span>
                    <span>
                      {won(cardMonth.totalBenefit)} / {won(cardMonth.totalCap)}
                    </span>
                  </div>
                  <Progress
                    value={cardMonth.totalBenefit}
                    max={cardMonth.totalCap}
                    tone="accent"
                    thin
                  />
                </div>

                <ul className="rule-list">
                  {card.benefits.map((rule) => {
                    const usage = usageMap.get(rule.id)
                    return (
                      <li key={rule.id} title={rule.note || undefined}>
                        <span className="rule-list__cat">
                          {categoryOf(rule.categoryId).emoji} {categoryOf(rule.categoryId).label}
                        </span>
                        <span className="rule-list__rate">{ratePercent(rule.rate)}</span>
                        <span className="rule-list__cap">
                          {usage ? `${won(usage.applied)} / ` : ''}
                          {won(rule.monthlyCap)}
                        </span>
                      </li>
                    )
                  })}
                </ul>

                <div className="card-panel__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setEditor({ card })}
                  >
                    카드 수정
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => toggleCard(card.id)}
                  >
                    {card.active ? '이 카드 숨기기' : '다시 사용하기'}
                  </button>
                </div>
              </div>
            </article>
          )
        })}
        </div>
      )}

      <p className="panel__note panel__note--standalone">
        <Icon name="sparkles" size={14} />
        기본 카드 5장은 실제 보유 카드 기준으로 입력했어요. 혜택은 2026-10 공개 자료를
        앱의 카테고리·한도 모델에 맞게 근사한 값이라 가맹점별 실제 조건과 다를 수 있어요.
        MG+ S 하나카드·KB국민 나라사랑체크카드·SKT 우리카드는 신규 발급이 중단된 상품이며,
        기존 보유 카드 약관을 기준으로 했어요. 자세한 조건은 카드 수정 화면의 메모와 카드사
        최신 약관을 확인해 주세요.
      </p>

      {editor && (
        <CardEditModal
          key={editor.card?.id ?? 'new-card'}
          card={editor.card}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  )
}
