import { isSavingsCategory } from '../data/categories'
import type { Transaction } from '../types'

/** 저축 거래를 시트의 투자납입으로 기록하기 위한 고정 분류 */
export const SAVINGS_SHEET = {
  categoryMajor: '투자납입',
  categoryMinor: '예적금',
  categoryGroup: '투자납입',
} as const

/**
 * 저축은 생활비 지출도, 카드 실적·혜택 대상도 아닙니다.
 * 어떤 경로로 저장되더라도 같은 규칙이 적용되도록 정규화합니다.
 */
export function withSavingsDefaults(transaction: Transaction): Transaction {
  if (!isSavingsCategory(transaction.categoryId)) return transaction

  return {
    ...transaction,
    excluded: true,
    cardId: null,
    categoryMajor: SAVINGS_SHEET.categoryMajor,
    categoryMinor: SAVINGS_SHEET.categoryMinor,
    categoryGroup: SAVINGS_SHEET.categoryGroup,
    paymentMethod: transaction.paymentMethod ?? '계좌이체',
  }
}
