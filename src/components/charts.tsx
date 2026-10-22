import { categoryOf } from '../data/categories'
import type { CategorySlice } from '../lib/analytics'
import { won, wonShort } from '../lib/format'

export function Donut({
  slices,
  total,
  label,
}: {
  slices: CategorySlice[]
  total: number
  label: string
}) {
  const size = 200
  const stroke = 24
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${label} 카테고리 비중`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
        />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {slices.map((slice) => {
            const length = Math.max(0, slice.share * circumference - 2)
            const dash = `${length} ${circumference}`
            const element = (
              <circle
                key={slice.category.id}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={slice.category.color}
                strokeWidth={stroke}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += slice.share * circumference
            return element
          })}
        </g>
      </svg>
      <div className="donut__center">
        <span>{label}</span>
        <strong>{wonShort(total)}</strong>
      </div>
    </div>
  )
}

export function TrendChart({
  data,
  activeMonth,
}: {
  data: { month: string; value: number }[]
  activeMonth: string
}) {
  const max = Math.max(...data.map((item) => item.value), 1)
  return (
    <div className="trend">
      {data.map((item) => {
        const height = Math.max(4, (item.value / max) * 100)
        const active = item.month === activeMonth
        return (
          <div className={`trend__item${active ? ' is-active' : ''}`} key={item.month}>
            <span className="trend__value">{wonShort(item.value)}</span>
            <div className="trend__track">
              <div className="trend__bar" style={{ height: `${height}%` }} />
            </div>
            <span className="trend__label">{Number(item.month.slice(5))}월</span>
          </div>
        )
      })}
    </div>
  )
}

export function CategoryBars({
  slices,
  limit = 6,
}: {
  slices: CategorySlice[]
  limit?: number
}) {
  const max = Math.max(...slices.map((slice) => slice.amount), 1)
  return (
    <ul className="cat-bars">
      {slices.slice(0, limit).map((slice) => (
        <li key={slice.category.id}>
          <span
            className="cat-bars__emoji"
            style={{
              background: `${slice.category.color}16`,
              borderColor: `${slice.category.color}2e`,
            }}
          >
            {slice.category.emoji}
          </span>
          <div className="cat-bars__main">
            <div className="cat-bars__row">
              <span className="cat-bars__label">{slice.category.label}</span>
              <span className="cat-bars__amount">{won(slice.amount)}</span>
              <span className="cat-bars__share">{Math.round(slice.share * 100)}%</span>
            </div>
            <div className="cat-bars__track">
              <div
                className="cat-bars__fill"
                style={{
                  width: `${(slice.amount / max) * 100}%`,
                  background: slice.category.color,
                }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function CategoryLegend({ slices }: { slices: CategorySlice[] }) {
  return (
    <ul className="legend">
      {slices.map((slice) => (
        <li key={slice.category.id}>
          <span className="legend__dot" style={{ background: slice.category.color }} />
          <span className="legend__label">
            {categoryOf(slice.category.id).emoji} {slice.category.label}
          </span>
          <span className="legend__value">{won(slice.amount)}</span>
          <span className="legend__share">{Math.round(slice.share * 100)}%</span>
        </li>
      ))}
    </ul>
  )
}
