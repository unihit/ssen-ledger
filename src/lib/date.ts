const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 로컬 시간대 기준 오늘 (YYYY-MM-DD) */
export function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

export function currentMonth(): string {
  return todayISO().slice(0, 7)
}

export function monthKeyOf(date: string): string {
  return date.slice(0, 7)
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber - 1 + delta, 1)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-')
  return `${year}년 ${Number(monthNumber)}월`
}

export function shortMonthLabel(month: string): string {
  return `${Number(month.split('-')[1])}월`
}

export function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber, 0).getDate()
}

export function daysElapsed(month: string): number {
  const today = todayISO()
  if (month === today.slice(0, 7)) return Number(today.slice(8, 10))
  if (month < today.slice(0, 7)) return daysInMonth(month)
  return 1
}

/** '10월 20일 (화)' */
export function formatDateKo(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()]
  return `${month}월 ${day}일 (${weekday})`
}

export function formatDateShort(date: string): string {
  const [, month, day] = date.split('-').map(Number)
  return `${month}/${day}`
}

export function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

/** 오래된 달 → 최신 달 */
export function lastNMonths(month: string, count: number): string[] {
  const months: string[] = []
  for (let i = count - 1; i >= 0; i -= 1) {
    months.push(shiftMonth(month, -i))
  }
  return months
}

export function isFutureMonth(month: string): boolean {
  return month > currentMonth()
}

export function monthProgress(month: string): number {
  return Math.min(1, daysElapsed(month) / daysInMonth(month))
}
