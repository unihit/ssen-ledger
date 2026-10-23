import {
  SPENDING_CATEGORIES,
  categoryOf,
  isSavingsCategory,
} from '../data/categories'
import type { AppState, Category, CategoryId, Transaction } from '../types'
import { shiftMonth } from './date'
import { ratio } from './format'

export interface CategorySlice {
  category: Category
  amount: number
  share: number
  count: number
}

export interface BudgetSummary {
  budget: number
  spend: number
  remaining: number
  usage: number
  over: boolean
}

export interface Insight {
  tone: 'good' | 'warn' | 'info'
  title: string
  body: string
}

export function monthTransactions(
  transactions: Transaction[],
  month: string,
): Transaction[] {
  return transactions.filter((transaction) => transaction.date.startsWith(month))
}

export function totalSpend(transactions: Transaction[], month: string): number {
  return monthTransactions(transactions, month)
    .filter((transaction) => !isSavingsCategory(transaction.categoryId))
    .reduce((total, transaction) => total + transaction.amount, 0)
}

export function categorySpend(
  transactions: Transaction[],
  month: string,
): Map<CategoryId, { amount: number; count: number }> {
  const result = new Map<CategoryId, { amount: number; count: number }>()
  for (const transaction of monthTransactions(transactions, month)) {
    if (isSavingsCategory(transaction.categoryId)) continue
    const current = result.get(transaction.categoryId) ?? { amount: 0, count: 0 }
    result.set(transaction.categoryId, {
      amount: current.amount + transaction.amount,
      count: current.count + 1,
    })
  }
  return result
}

export function categorySlices(
  transactions: Transaction[],
  month: string,
): CategorySlice[] {
  const total = totalSpend(transactions, month)
  const grouped = categorySpend(transactions, month)
  return [...grouped.entries()]
    .map(([id, value]) => ({
      category: categoryOf(id),
      amount: value.amount,
      count: value.count,
      share: ratio(value.amount, total),
    }))
    .sort((a, b) => b.amount - a.amount)
}

export function budgetSummary(state: AppState, month: string): BudgetSummary {
  const spend = totalSpend(state.transactions, month)
  const budget = state.settings.monthlyBudget
  return {
    budget,
    spend,
    remaining: budget - spend,
    usage: ratio(spend, budget),
    over: spend > budget,
  }
}

export function categoryBudgetRows(state: AppState, month: string) {
  const grouped = categorySpend(state.transactions, month)
  return SPENDING_CATEGORIES.map((category) => {
    const budget = state.settings.categoryBudgets[category.id] ?? 0
    const spend = grouped.get(category.id)?.amount ?? 0
    return {
      category,
      budget,
      spend,
      usage: ratio(spend, budget),
      remaining: budget - spend,
    }
  }).filter((row) => row.budget > 0 || row.spend > 0)
}

export function buildInsights(state: AppState, month: string): Insight[] {
  const insights: Insight[] = []
  const spend = totalSpend(state.transactions, month)
  const budget = state.settings.monthlyBudget
  const prevMonth = shiftMonth(month, -1)
  const prevSpend = totalSpend(state.transactions, prevMonth)
  const slices = categorySlices(state.transactions, month)

  if (budget > 0) {
    const usage = spend / budget
    if (usage >= 1) {
      insights.push({
        tone: 'warn',
        title: '이번 달 예산을 초과했어요',
        body: `예산보다 ${Math.round(spend - budget).toLocaleString('ko-KR')}원 더 썼어요. 남은 기간은 고정지출 위주로 관리해보세요.`,
      })
    } else if (usage >= 0.8) {
      insights.push({
        tone: 'warn',
        title: '예산의 80%를 사용했어요',
        body: `남은 예산은 ${Math.round(budget - spend).toLocaleString('ko-KR')}원이에요. 큰 지출은 다음 달로 미뤄보세요.`,
      })
    } else {
      insights.push({
        tone: 'good',
        title: '예산 페이스가 안정적이에요',
        body: `이번 달 예산의 ${Math.round(usage * 100)}%를 사용했어요. 지금 흐름이면 ${Math.round(budget - spend).toLocaleString('ko-KR')}원을 남길 수 있어요.`,
      })
    }
  }

  if (prevSpend > 0 && spend > 0) {
    const diff = spend - prevSpend
    const rate = Math.abs(diff) / prevSpend
    if (rate >= 0.2) {
      insights.push({
        tone: diff > 0 ? 'warn' : 'good',
        title: diff > 0 ? '지난달보다 지출이 늘었어요' : '지난달보다 지출이 줄었어요',
        body: `${diff > 0 ? '+' : ''}${Math.round(diff).toLocaleString('ko-KR')}원 (${Math.round(rate * 100)}%) ${diff > 0 ? '증가' : '감소'}했어요.`,
      })
    }
  }

  const top = slices[0]
  if (top && top.share >= 0.2) {
    insights.push({
      tone: 'info',
      title: `${top.category.label} 지출이 가장 커요`,
      body: `전체 지출의 ${Math.round(top.share * 100)}%를 차지해요. 이번 달 ${top.count}건, ${top.amount.toLocaleString('ko-KR')}원을 썼어요.`,
    })
  }

  const growth = slices
    .map((slice) => {
      const prev = categorySpend(state.transactions, prevMonth).get(slice.category.id)?.amount ?? 0
      return { slice, prev, diff: slice.amount - prev }
    })
    .filter((row) => row.prev > 0 && row.diff > 15_000 && row.diff / row.prev >= 0.3)
    .sort((a, b) => b.diff - a.diff)[0]

  if (growth) {
    insights.push({
      tone: 'warn',
      title: `${growth.slice.category.label} 지출이 늘었어요`,
      body: `지난달보다 ${growth.diff.toLocaleString('ko-KR')}원 더 썼어요. ${growth.slice.category.label} 예산을 다시 확인해보세요.`,
    })
  }

  return insights.slice(0, 4)
}
