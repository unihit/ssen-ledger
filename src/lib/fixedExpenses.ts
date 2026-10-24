import type {
  CategoryId,
  FixedExpense,
  FixedExpenseApplication,
  Transaction,
} from '../types'
import { daysInMonth, todayISO } from './date'

export type FixedExpenseStatus = 'recorded' | 'upcoming' | 'due'

const SHEET_TO_APP_CATEGORY: Record<string, CategoryId> = {
  '수입|급여': 'etc',
  '수입|수당': 'etc',
  '수입|배당·이자': 'etc',
  '수입|기타수입': 'etc',
  '생활비|주거': 'etc',
  '생활비|통신': 'telecom',
  '생활비|생활': 'living',
  '생활비|마트': 'mart',
  '생활비|외식비': 'food',
  '생활비|회사식비': 'food',
  '생활비|건강': 'medical',
  '생활비|교통': 'transport',
  '생활비|경조사': 'etc',
  '생활비|상품권': 'shopping',
  '생활비|보험료': 'etc',
  '생활비|회비': 'etc',
  '생활비|기부금': 'etc',
  '생활비|의복/미용': 'shopping',
  '생활비|카페': 'cafe',
  '생활비|자동차': 'fuel',
  '생활비|대출이자': 'etc',
  '생활비|차입금이자': 'etc',
  '생활비|구독': 'subscription',
  '생활비|기타': 'etc',
  '생활비|게임': 'culture',
  '투자납입|예적금': 'savings',
  '투자납입|IRP·연금': 'savings',
  '투자납입|ISA': 'savings',
  '투자납입|국내주식': 'savings',
  '투자납입|해외주식': 'savings',
  '투자납입|기타투자': 'savings',
  '투자회수|예적금': 'etc',
  '투자회수|IRP·연금': 'etc',
  '투자회수|ISA': 'etc',
  '투자회수|국내주식': 'etc',
  '투자회수|해외주식': 'etc',
  '투자회수|기타투자': 'etc',
  '대출차입|마이너스통장': 'etc',
  '대출차입|가족차입': 'etc',
  '대출차입|기타대출': 'etc',
  '대출상환|마이너스통장': 'etc',
  '대출상환|가족차입': 'etc',
  '대출상환|차입원금상환': 'etc',
  '대출상환|기타대출': 'etc',
  '계좌이체|본인계좌이체': 'etc',
}

export function appCategoryForSheet(
  categoryMajor: string,
  categoryMinor: string,
): CategoryId {
  const mapped = SHEET_TO_APP_CATEGORY[`${categoryMajor}|${categoryMinor}`]
  if (mapped) return mapped
  if (categoryMajor === '투자납입') return 'savings'
  return 'etc'
}

export function categoryGroupForMajor(categoryMajor: string): string {
  switch (categoryMajor) {
    case '수입':
    case '생활비':
    case '투자납입':
    case '투자회수':
    case '대출차입':
    case '대출상환':
      return categoryMajor
    default:
      return '집계 제외'
  }
}

/** IRP·연금처럼 투자납입으로 분류된 고정지출인지 */
export function isSavingsFixedExpense(
  fixedExpense: Pick<FixedExpense, 'categoryId' | 'categoryMajor' | 'categoryGroup'>,
): boolean {
  return (
    fixedExpense.categoryId === 'savings' ||
    fixedExpense.categoryGroup === '투자납입' ||
    fixedExpense.categoryMajor === '투자납입'
  )
}

export function fixedExpenseDayLabel(dayOfMonth: number): string {
  return dayOfMonth >= 31 ? '말일' : `${dayOfMonth}일`
}

/** 해당 월의 실제 후보일. 31일은 말일로 계산한다. */
export function fixedExpenseDueDate(
  fixedExpense: Pick<FixedExpense, 'dayOfMonth'>,
  month: string,
): string {
  const lastDay = daysInMonth(month)
  const day =
    fixedExpense.dayOfMonth >= 31
      ? lastDay
      : Math.min(Math.max(1, fixedExpense.dayOfMonth), lastDay)
  return `${month}-${String(day).padStart(2, '0')}`
}

export function fixedExpensesForMonth(
  fixedExpenses: FixedExpense[],
  month: string,
): FixedExpense[] {
  return fixedExpenses.filter((fixedExpense) => {
    if (!fixedExpense.active) return false
    if (fixedExpense.startMonth && month < fixedExpense.startMonth) return false
    if (fixedExpense.endMonth && month > fixedExpense.endMonth) return false
    return true
  })
}

export function applicationFor(
  applications: FixedExpenseApplication[],
  fixedExpenseId: string,
  month: string,
): FixedExpenseApplication | undefined {
  return applications.find(
    (application) =>
      application.fixedExpenseId === fixedExpenseId &&
      application.month === month,
  )
}

export function fixedExpenseDDayLabel(
  dueDate: string,
  today = todayISO(),
): string {
  const due = new Date(dueDate)
  const cur = new Date(today)
  const diffTime = due.getTime() - cur.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'D-Day'
  if (diffDays > 0) return `D-${diffDays}`
  return `${Math.abs(diffDays)}일 지남`
}

export function fixedExpenseStatus(
  fixedExpense: FixedExpense,
  month: string,
  applications: FixedExpenseApplication[],
  today = todayISO(),
  transactions?: Transaction[],
): {
  status: FixedExpenseStatus
  dueDate: string
  application?: FixedExpenseApplication
  dDayLabel?: string
} {
  const application = applicationFor(applications, fixedExpense.id, month)
  // 거래 목록이 주어지면, 해당 반영 거래가 실제로 존재하고 취소되지 않은 경우에만 'recorded'로 판정한다.
  const isTransactionActive =
    !transactions ||
    !application ||
    transactions.some(
      (tx) =>
        (tx.id === application.transactionId ||
          (tx.fixedExpenseId === fixedExpense.id &&
            tx.date.startsWith(month))) &&
        (tx.status ?? 'active') !== 'canceled',
    )

  if (application && isTransactionActive) {
    return { status: 'recorded', dueDate: application.date, application }
  }

  const dueDate = fixedExpenseDueDate(fixedExpense, month)
  return {
    status: dueDate > today ? 'upcoming' : 'due',
    dueDate,
    dDayLabel: fixedExpenseDDayLabel(dueDate, today),
  }
}

export function fixedExpenseStatusLabel(status: FixedExpenseStatus): string {
  switch (status) {
    case 'recorded':
      return '기록됨'
    case 'upcoming':
      return '예정'
    case 'due':
    default:
      return '반영 후보'
  }
}
