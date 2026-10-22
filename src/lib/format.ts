export function won(value: number): string {
  const rounded = Math.round(value)
  const sign = rounded < 0 ? '-' : ''
  return `${sign}${Math.abs(rounded).toLocaleString('ko-KR')}원`
}

export function number(value: number): string {
  return Math.round(value).toLocaleString('ko-KR')
}

/** 1,234,000 → 123.4만원 */
export function wonShort(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 100_000_000) {
    const eok = abs / 100_000_000
    return `${sign}${trimZero(eok >= 10 ? eok.toFixed(0) : eok.toFixed(1))}억원`
  }
  if (abs >= 10_000) {
    const man = abs / 10_000
    return `${sign}${trimZero(man >= 100 ? man.toFixed(0) : man.toFixed(1))}만원`
  }
  return won(value)
}

/** 차트 축: 120000 → '12만' */
export function manwon(value: number): string {
  if (value === 0) return '0'
  if (Math.abs(value) >= 10_000) {
    const man = value / 10_000
    return `${trimZero(man >= 100 ? man.toFixed(0) : man.toFixed(1))}만`
  }
  return `${Math.round(value).toLocaleString('ko-KR')}`
}

function trimZero(text: string): string {
  return text.replace(/\.0$/, '')
}

/** 0.1 → 10% */
export function ratePercent(rate: number): string {
  if (rate <= 0) return '0%'
  return `${trimZero((rate * 100).toFixed(rate * 100 < 1 ? 2 : 1))}%`
}

export function percent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '0%'
  return `${value.toFixed(digits)}%`
}

export function signedWon(value: number): string {
  if (value === 0) return won(0)
  return `${value > 0 ? '+' : ''}${won(value)}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function ratio(value: number, total: number): number {
  if (total <= 0) return 0
  return value / total
}
