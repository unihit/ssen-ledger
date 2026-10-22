import { useMemo } from 'react'
import { CategoryLegend, Donut, TrendChart } from '../components/charts'
import { Icon } from '../components/Icon'
import { Badge, MonthPicker } from '../components/ui'
import { categoryOf } from '../data/categories'
import { buildInsights, categorySlices, totalSpend } from '../lib/analytics'
import { computeCardMonth } from '../lib/benefits'
import { lastNMonths, shiftMonth } from '../lib/date'
import { ratePercent, signedWon, won } from '../lib/format'
import { useApp } from '../store'

export function ReportPage() {
  const { state, month, setMonth } = useApp()
  const prevMonth = shiftMonth(month, -1)

  const slices = categorySlices(state.transactions, month)
  const prevSlices = categorySlices(state.transactions, prevMonth)
  const prevMap = new Map(prevSlices.map((slice) => [slice.category.id, slice.amount]))
  const spend = totalSpend(state.transactions, month)
  const prevSpend = totalSpend(state.transactions, prevMonth)
  const insights = buildInsights(state, month)
  const trend = lastNMonths(month, 6).map((target) => ({
    month: target,
    value: totalSpend(state.transactions, target),
  }))

  const comparison = useMemo(() => {
    const currentMap = new Map(slices.map((slice) => [slice.category.id, slice.amount]))
    const ids = new Set([...currentMap.keys(), ...prevMap.keys()])
    return [...ids]
      .map((id) => {
        const amount = currentMap.get(id) ?? 0
        const prev = prevMap.get(id) ?? 0
        return {
          category: categoryOf(id),
          amount,
          prev,
          diff: amount - prev,
          rate: prev > 0 ? (amount - prev) / prev : amount > 0 ? 1 : 0,
        }
      })
      .sort((a, b) => b.amount - a.amount)
  }, [slices, prevSlices])

  const cardRows = state.cards
    .filter((card) => card.active)
    .map((card) => ({
      card,
      summary: computeCardMonth(card, state.transactions, month),
    }))
  const totalBenefit = cardRows.reduce((sum, row) => sum + row.summary.totalBenefit, 0)
  const bestCard = [...cardRows].sort(
    (a, b) => b.summary.totalBenefit - a.summary.totalBenefit,
  )[0]

  const diff = spend - prevSpend
  const diffRate = prevSpend > 0 ? diff / prevSpend : 0

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="page-head__eyebrow">REPORT</p>
          <h1>리포트</h1>
        </div>
        <div className="page-head__actions">
          <MonthPicker month={month} onChange={setMonth} />
        </div>
      </header>

      <section className="insights">
        {insights.map((insight) => (
          <article className={`insight insight--${insight.tone}`} key={insight.title}>
            <span className="insight__icon">
              <Icon name={insight.tone === 'good' ? 'check' : 'sparkles'} size={18} />
            </span>
            <div>
              <strong>{insight.title}</strong>
              <p>{insight.body}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="panel">
        <header className="panel__head">
          <div>
            <h2>월별 지출 추이</h2>
            <p>최근 6개월</p>
          </div>
          <Badge tone={diff > 0 ? 'warn' : 'success'}>
            전월 대비 {diff === 0 ? '동일' : `${diff > 0 ? '+' : ''}${Math.round(diffRate * 100)}%`}
          </Badge>
        </header>
        <TrendChart data={trend} activeMonth={month} />
      </section>

      <div className="report-grid">
        <section className="panel">
          <header className="panel__head">
            <div>
              <h2>카테고리 비중</h2>
              <p>{won(spend)} 중</p>
            </div>
          </header>
          {slices.length === 0 ? (
            <p className="panel__empty">이번 달 지출이 없어요.</p>
          ) : (
            <div className="donut-wrap">
              <Donut slices={slices} total={spend} label="이번 달 지출" />
              <CategoryLegend slices={slices.slice(0, 8)} />
            </div>
          )}
        </section>

        <section className="panel">
          <header className="panel__head">
            <div>
              <h2>카드 혜택 리포트</h2>
              <p>이번 달 받은 혜택 {won(totalBenefit)}</p>
            </div>
            {bestCard && bestCard.summary.totalBenefit > 0 && (
              <Badge tone="accent">BEST {bestCard.card.name}</Badge>
            )}
          </header>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>카드</th>
                  <th>결제</th>
                  <th>혜택</th>
                  <th>혜택률</th>
                  <th>실적</th>
                </tr>
              </thead>
              <tbody>
                {cardRows.map(({ card, summary }) => (
                  <tr key={card.id}>
                    <td>
                      <span
                        className="table__dot"
                        style={{
                          background: `linear-gradient(135deg, ${card.colorFrom}, ${card.colorTo})`,
                        }}
                      />
                      {card.name}
                    </td>
                    <td>{won(summary.spend)}</td>
                    <td className="table__accent">{won(summary.totalBenefit)}</td>
                    <td>{ratePercent(summary.effectiveRate)}</td>
                    <td>
                      {card.minSpendForBenefits === 0 ? (
                        <span className="table__muted">조건 없음</span>
                      ) : summary.performanceMet ? (
                        <span className="table__good">충족</span>
                      ) : (
                        <span className="table__warn">미달</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="panel__note">
            <Icon name="sparkles" size={14} />한도가 큰 카드라도 내 소비 카테고리와 맞아야 혜택이
            커져요.
          </p>
        </section>
      </div>

      <section className="panel">
        <header className="panel__head">
          <div>
            <h2>카테고리별 전월 비교</h2>
            <p>
              {prevMonth.slice(5)}월 {won(prevSpend)} → {month.slice(5)}월 {won(spend)}
            </p>
          </div>
          <span className={`panel__diff${diff > 0 ? ' is-up' : ' is-down'}`}>
            {signedWon(diff)}
          </span>
        </header>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>카테고리</th>
                <th>이번 달</th>
                <th>지난달</th>
                <th>증감</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.category.id}>
                  <td>
                    <span className="table__emoji">{row.category.emoji}</span>
                    {row.category.label}
                  </td>
                  <td>{won(row.amount)}</td>
                  <td className="table__muted">{won(row.prev)}</td>
                  <td>
                    {row.diff === 0 ? (
                      <span className="table__muted">-</span>
                    ) : (
                      <span className={row.diff > 0 ? 'table__warn' : 'table__good'}>
                        {row.diff > 0 ? (
                          <Icon name="up" size={13} />
                        ) : (
                          <Icon name="down" size={13} />
                        )}
                        {signedWon(row.diff)}
                        {row.prev > 0 && ` (${Math.round(Math.abs(row.rate) * 100)}%)`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
