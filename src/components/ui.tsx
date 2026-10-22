import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { currentMonth, isFutureMonth, monthLabel, shiftMonth } from '../lib/date'

export function Progress({
  value,
  max,
  tone,
  thin,
}: {
  value: number
  max: number
  tone?: 'accent' | 'success' | 'warn' | 'danger' | 'light'
  thin?: boolean
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const auto = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : 'accent'
  const finalTone = tone ?? auto
  return (
    <div className={`progress${thin ? ' progress--thin' : ''}`}>
      <div
        className={`progress__bar progress__bar--${finalTone}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'warn' | 'danger'
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export function MonthPicker({
  month,
  onChange,
  dark,
}: {
  month: string
  onChange: (month: string) => void
  dark?: boolean
}) {
  return (
    <div className={`month-picker${dark ? ' month-picker--dark' : ''}`}>
      <button
        type="button"
        className="month-picker__button"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="이전 달"
      >
        <Icon name="left" size={18} />
      </button>
      <span className="month-picker__label">{monthLabel(month)}</span>
      <button
        type="button"
        className="month-picker__button"
        onClick={() => onChange(shiftMonth(month, 1))}
        aria-label="다음 달"
        disabled={month >= currentMonth()}
      >
        <Icon name="right" size={18} />
      </button>
    </div>
  )
}

export function EmptyState({
  emoji,
  title,
  body,
}: {
  emoji: string
  title: string
  body?: string
}) {
  return (
    <div className="empty">
      <div className="empty__emoji">{emoji}</div>
      <strong>{title}</strong>
      {body && <p>{body}</p>}
    </div>
  )
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

export function nextMonthLabel(month: string): string {
  const next = shiftMonth(month, 1)
  return isFutureMonth(next) ? '다음 달' : `${monthLabel(next)}`
}
