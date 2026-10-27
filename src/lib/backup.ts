import { categoryOf } from '../data/categories'
import { isExcludedFromSpend } from './analytics'
import type { Card, Transaction } from '../types'

export function downloadText(
  filename: string,
  content: string,
  mime = 'text/plain;charset=utf-8',
  withBom = false,
): void {
  const blob = new Blob([withBom ? `\ufeff${content}` : content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function escapeCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

export function transactionsToCSV(transactions: Transaction[], cards: Card[]): string {
  const cardName = (id: string | null) =>
    id ? cards.find((card) => card.id === id)?.name ?? '카드' : '현금·계좌'

  const header = ['날짜', '결제처', '카테고리', '결제수단', '금액', '메모', '실적제외', '지출제외']
  const rows = [...transactions]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((transaction) => [
      transaction.date,
      transaction.merchant,
      categoryOf(transaction.categoryId).label,
      cardName(transaction.cardId),
      transaction.amount,
      transaction.memo ?? '',
      transaction.excluded ? 'Y' : '',
      isExcludedFromSpend(transaction) ? 'Y' : '',
    ])

  return [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')
}
