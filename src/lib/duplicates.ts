import type { CategoryId, Transaction } from '../types'

function isActive(transaction: Transaction): boolean {
  return (transaction.status ?? 'active') !== 'canceled'
}

/**
 * 같은 날짜·분류·금액의 활성 거래를 찾습니다.
 * 고정지출 반영분도 포함합니다. 사용자가 "이미 있는 거래"를 확인할 수 있게
 * 경고만 하고 저장을 막지는 않습니다.
 */
export function findManualDuplicates(
  transactions: Transaction[],
  input: { date: string; amount: number; categoryId: CategoryId },
  excludeId?: string,
): Transaction[] {
  return transactions.filter(
    (transaction) =>
      isActive(transaction) &&
      transaction.id !== excludeId &&
      transaction.date === input.date &&
      transaction.amount === input.amount &&
      transaction.categoryId === input.categoryId,
  )
}

/**
 * 고정지출 후보: 아직 고정지출에 연결되지 않았고, 반영 예정일·금액이 같은 거래.
 * 자동으로 연결하지 않고 사용자에게 확인을 받기 위한 목록입니다.
 */
export function findUnlinkedCandidates(
  transactions: Transaction[],
  input: { date: string; amount: number },
  excludeIds: string[] = [],
): Transaction[] {
  return transactions.filter(
    (transaction) =>
      isActive(transaction) &&
      !transaction.fixedExpenseId &&
      !excludeIds.includes(transaction.id) &&
      transaction.date === input.date &&
      (transaction.effectiveAmount ?? transaction.amount) === input.amount,
  )
}
