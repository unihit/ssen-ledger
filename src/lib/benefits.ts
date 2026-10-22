import { categoryOf } from '../data/categories'
import type {
  BenefitRule,
  Card,
  CategoryId,
  PerformanceTier,
  Transaction,
} from '../types'
import { shiftMonth } from './date'
import { ratePercent, won, wonShort } from './format'

export interface RuleUsage {
  rule: BenefitRule
  spend: number
  raw: number
  applied: number
  capLeft: number
}

export interface CardMonth {
  card: Card
  /** 전월 실적 */
  prevSpend: number
  /** 이번 달 결제 금액 (실적/혜택 대상) */
  spend: number
  performanceMet: boolean
  /** 다음 달 혜택 기준까지 남은 금액 (이번 달 실적 기준) */
  toRequirement: number
  nextTier: number | null
  nextTierRemaining: number
  rows: RuleUsage[]
  baseSpend: number
  baseApplied: number
  rawBenefit: number
  totalBenefit: number
  /** 이번 달에 실제 적용되는 통합 한도 (전월 실적 구간 반영) */
  totalCap: number
  /** 전월 실적 구간 중 매칭된 구간. 없으면 null */
  performanceTier: PerformanceTier | null
  capUsed: number
  capLeft: number
  effectiveRate: number
  capped: boolean
}

function isCounted(transaction: Transaction): boolean {
  return !transaction.excluded && transaction.amount > 0
}

/**
 * 카테고리 혜택을 우선 적용하고, 카테고리 혜택이 없을 때만 결제수단 혜택을 찾는다.
 * 같은 결제가 두 혜택에 중복 계산되지 않도록 하기 위함이다.
 */
function ruleForTransaction(
  rules: BenefitRule[],
  transaction: Transaction,
): BenefitRule | null {
  const categoryRule = rules.find(
    (rule) => rule.categoryId === transaction.categoryId,
  )
  if (categoryRule) return categoryRule

  return (
    rules.find((rule) =>
      rule.paymentMethods?.includes(transaction.paymentMethod ?? ''),
    ) ?? null
  )
}

export function cardSpend(
  transactions: Transaction[],
  cardId: string,
  month: string,
): number {
  return transactions.reduce((total, transaction) => {
    if (transaction.cardId !== cardId) return total
    if (!isCounted(transaction)) return total
    if (!transaction.date.startsWith(month)) return total
    return total + transaction.amount
  }, 0)
}

export function matchedPerformanceTier(
  card: Card,
  prevSpend: number,
): PerformanceTier | null {
  const tiers = [...(card.performanceTiers ?? [])].sort(
    (a, b) => a.minSpend - b.minSpend,
  )
  let matched: PerformanceTier | null = null
  for (const tier of tiers) {
    if (prevSpend >= tier.minSpend) matched = tier
    else break
  }
  return matched
}

export function cardTiers(card: Card): number[] {
  const tiers = new Set<number>()
  if (card.minSpendForBenefits > 0) tiers.add(card.minSpendForBenefits)
  for (const rule of card.benefits) {
    if (rule.minSpend && rule.minSpend > 0) tiers.add(rule.minSpend)
  }
  for (const tier of card.performanceTiers ?? []) {
    if (tier.minSpend > 0) tiers.add(tier.minSpend)
  }
  return [...tiers].sort((a, b) => a - b)
}

export function computeCardMonth(
  card: Card,
  transactions: Transaction[],
  month: string,
): CardMonth {
  const prevSpend = cardSpend(transactions, card.id, shiftMonth(month, -1))
  const monthTransactions = transactions.filter(
    (transaction) =>
      transaction.cardId === card.id &&
      isCounted(transaction) &&
      transaction.date.startsWith(month),
  )
  const spend = monthTransactions.reduce((total, transaction) => total + transaction.amount, 0)
  const performanceMet = prevSpend >= card.minSpendForBenefits
  const performanceTier = matchedPerformanceTier(card, prevSpend)
  const totalCap = performanceTier?.monthlyTotalCap ?? card.monthlyTotalCap

  const applicableRules = performanceMet
    ? card.benefits.filter((rule) => prevSpend >= (rule.minSpend ?? card.minSpendForBenefits))
    : []

  const ruleSpend = new Map<string, number>(
    applicableRules.map((rule) => [rule.id, 0]),
  )
  const countedByRule = new Set<Transaction>()

  for (const transaction of monthTransactions) {
    const rule = ruleForTransaction(applicableRules, transaction)
    if (!rule) continue

    // 카테고리/결제수단 혜택에 잡힌 결제는 기본 적립에서 제외한다.
    countedByRule.add(transaction)
    if (rule.minTransactionAmount && transaction.amount < rule.minTransactionAmount) {
      continue
    }
    ruleSpend.set(rule.id, (ruleSpend.get(rule.id) ?? 0) + transaction.amount)
  }

  const rows: RuleUsage[] = applicableRules.map((rule) => {
    const categorySpend = ruleSpend.get(rule.id) ?? 0
    const raw = Math.round(categorySpend * rule.rate)
    const applied = Math.min(raw, rule.monthlyCap)
    return {
      rule,
      spend: categorySpend,
      raw,
      applied,
      capLeft: Math.max(0, rule.monthlyCap - applied),
    }
  })

  const baseSpend =
    performanceMet && card.baseRate > 0
      ? monthTransactions.reduce((total, transaction) => {
          if (countedByRule.has(transaction)) return total
          return total + transaction.amount
        }, 0)
      : 0
  const baseApplied = performanceMet
    ? Math.min(Math.round(baseSpend * card.baseRate), card.baseCap)
    : 0

  const rawBenefit = rows.reduce((total, row) => total + row.applied, 0) + baseApplied
  const totalBenefit = Math.min(rawBenefit, totalCap)

  const tiers = cardTiers(card)
  const nextTier = tiers.find((tier) => tier > spend) ?? null

  return {
    card,
    prevSpend,
    spend,
    performanceMet,
    toRequirement: Math.max(0, card.minSpendForBenefits - spend),
    nextTier,
    nextTierRemaining: nextTier === null ? 0 : Math.max(0, nextTier - spend),
    rows,
    baseSpend,
    baseApplied,
    rawBenefit,
    totalBenefit,
    totalCap,
    performanceTier,
    capUsed: totalBenefit,
    capLeft: Math.max(0, totalCap - totalBenefit),
    effectiveRate: spend > 0 ? totalBenefit / spend : 0,
    capped: rawBenefit > totalCap,
  }
}

export interface RecommendationInput {
  categoryId: CategoryId
  amount: number
  merchant?: string
}

export interface Recommendation {
  card: Card
  before: CardMonth
  after: CardMonth
  gain: number
  eligible: boolean
  matchedRule: BenefitRule | null
  reason: string
}

/**
 * 결제 1건을 각 카드에 가상으로 넣어보고 혜택 증가분을 비교한다.
 * 한도/실적 조건이 모두 반영된 실제 계산 방식.
 */
export function recommendCards(
  cards: Card[],
  transactions: Transaction[],
  month: string,
  input: RecommendationInput,
): Recommendation[] {
  const amount = Math.max(0, Math.round(input.amount))
  const simulationDate = `${month}-01`
  const results: Recommendation[] = []

  for (const card of cards) {
    if (!card.active) continue
    const before = computeCardMonth(card, transactions, month)
    const simulated: Transaction = {
      id: '__simulation__',
      date: simulationDate,
      merchant: input.merchant?.trim() || '결제 예정',
      amount,
      categoryId: input.categoryId,
      cardId: card.id,
    }
    // 같은 카드에 결제 1건을 더했을 때의 혜택 증가분만 본다.
    const simulatedAfter = computeCardMonth(card, [...transactions, simulated], month)
    const gain = Math.max(0, simulatedAfter.totalBenefit - before.totalBenefit)
    const after = simulatedAfter

    const applicable = before.rows.find(
      (row) => row.rule.categoryId === input.categoryId,
    )
    const configured =
      card.benefits.find((rule) => rule.categoryId === input.categoryId) ?? null
    const matchedRule = applicable?.rule ?? configured

    let reason = ''
    if (!before.performanceMet) {
      reason = `전월 실적 ${wonShort(before.card.minSpendForBenefits)} 미달`
    } else if (applicable) {
      if (
        applicable.rule.minTransactionAmount &&
        amount < applicable.rule.minTransactionAmount
      ) {
        reason = `건당 ${won(applicable.rule.minTransactionAmount)} 이상 결제 시 적용`
      } else if (gain > 0) {
        reason = `${categoryOf(applicable.rule.categoryId).label} ${ratePercent(applicable.rule.rate)} · +${won(gain)}`
      } else if (before.capLeft <= 0) {
        reason = '이번 달 통합 한도 소진'
      } else {
        reason = `${categoryOf(applicable.rule.categoryId).label} 한도 소진`
      }
    } else if (configured?.minSpend) {
      reason = `전월 ${wonShort(configured.minSpend)} 실적 필요`
    } else if (gain > 0) {
      reason = `기본 적립 ${ratePercent(before.card.baseRate)} · +${won(gain)}`
    } else if (before.capLeft <= 0) {
      reason = '이번 달 혜택 한도 소진'
    } else {
      reason = '이 카드엔 혜택 카테고리가 없어요'
    }

    results.push({
      card,
      before,
      after,
      gain,
      eligible: before.performanceMet,
      matchedRule,
      reason,
    })
  }

  return results.sort((a, b) => {
    if (b.gain !== a.gain) return b.gain - a.gain
    if (b.before.performanceMet !== a.before.performanceMet) {
      return Number(b.before.performanceMet) - Number(a.before.performanceMet)
    }
    return b.after.effectiveRate - a.after.effectiveRate
  })
}

export function totalBenefit(cards: Card[], transactions: Transaction[], month: string): number {
  return cards.reduce(
    (total, card) => total + computeCardMonth(card, transactions, month).totalBenefit,
    0,
  )
}

export function activeCards(cards: Card[]): Card[] {
  return cards.filter((card) => card.active)
}
