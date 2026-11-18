import { CATEGORIES, categoryOf } from '../data/categories'
import type {
  BenefitRule,
  Card,
  CardSortMode,
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
  count: number
}

export interface CardMonth {
  card: Card
  /** 전월 실적 */
  prevSpend: number
  /** 이번 달 결제 금액 (실적/혜택 대상) */
  spend: number
  performanceMet: boolean
  /** 신규 발급 실적 유예 적용 여부 */
  inGracePeriod: boolean
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

const MERCHANT_ALIAS_GROUPS: string[][] = [
  ['vips', '빕스'],
  ['배민', '배달의민족'],
  ['스벅', '스타벅스'],
  ['쿠팡와우', '쿠팡로켓와우', '로켓와우'],
  ['롯데시네마', '롯시'],
  ['메가mgc', '메가커피'],
  ['컴포즈', '컴포즈커피'],
  ['gs25해군마트', '해군마트'],
  ['아파트관리비', '관리비'],
  ['ktx', '코레일'],
  ['올리브영', '올영'],
  ['gs칼텍스', '지에스칼텍스'],
]

const GENERIC_CATEGORY_PLACEHOLDERS = new Set(
  CATEGORIES.map((category) => `${category.label.replace(/\s+/g, '').toLowerCase()}결제`),
)

function normalizeText(text?: string): string {
  return (text ?? '').trim().toLowerCase().replace(/\s+/g, '')
}

function expandMerchantAliases(normalized: string): string[] {
  if (!normalized) return []
  const forms = new Set<string>([normalized])
  for (const group of MERCHANT_ALIAS_GROUPS) {
    for (const member of group) {
      if (normalized.includes(member)) {
        for (const alias of group) {
          forms.add(normalized.replace(member, alias))
        }
      }
    }
  }
  return [...forms]
}

function isPlaceholderMerchant(normalized: string): boolean {
  if (!normalized) return true
  if (normalized === '결제예정' || normalized === '결제') return true
  return GENERIC_CATEGORY_PLACEHOLDERS.has(normalized)
}

const TAXI_MERCHANT_RE =
  /카카오\s*t|카카오\s*택시|kakao\s*t|택시|우버|uber|타다|tada|아이엠택시|온다택시|마카롱택시|티머니\s*onda/i
const TAXI_MEMO_RE = /택시/i
const GENERAL_TRANSPORT_RE = /코레일|korail|ktx|고속버스|코버스/i

export function isTaxiTransaction(tx: {
  merchant?: string | null
  memo?: string | null
}): boolean {
  const m = (tx.merchant ?? '').trim()
  const memo = (tx.memo ?? '').trim()
  return TAXI_MERCHANT_RE.test(m) || TAXI_MEMO_RE.test(memo)
}

export function isGeneralTransportTransaction(tx: {
  merchant?: string | null
  memo?: string | null
}): boolean {
  if (isTaxiTransaction(tx)) return true
  const m = (tx.merchant ?? '').trim()
  const memo = (tx.memo ?? '').trim()
  return GENERAL_TRANSPORT_RE.test(m) || GENERAL_TRANSPORT_RE.test(memo)
}

function isExcludedFromBenefit(transaction: Transaction): boolean {
  if (transaction.excluded) return true
  if (
    transaction.categoryId === 'savings' ||
    transaction.categoryId === 'giftcard' ||
    transaction.categoryMinor === '상품권'
  ) {
    return true
  }
  if (
    transaction.merchant &&
    /실적\s*채움|문화상품권/i.test(transaction.merchant)
  ) {
    return true
  }
  if (
    transaction.memo &&
    /실적\s*채우기|전월실적\s*더미|노카운트|문화상품권/i.test(transaction.memo)
  ) {
    return true
  }
  return false
}

export function ruleMatchesMerchant(
  rule: BenefitRule,
  merchant?: string,
  memo?: string,
): boolean {
  if (!rule.merchants || rule.merchants.length === 0) return true
  const normMerchant = normalizeText(merchant)
  const normMemo = normalizeText(memo)
  if (isPlaceholderMerchant(normMerchant) && !normMemo) return false

  const formsToCheck = [
    ...(!isPlaceholderMerchant(normMerchant)
      ? expandMerchantAliases(normMerchant)
      : []),
    ...expandMerchantAliases(normMemo),
  ]
  if (formsToCheck.length === 0) return false

  for (const keyword of rule.merchants) {
    const normKw = normalizeText(keyword)
    if (!normKw) continue
    const kwForms = expandMerchantAliases(normKw)
    for (const mf of formsToCheck) {
      for (const kf of kwForms) {
        if (mf === kf) return true
        if (mf.length >= 2 && kf.length >= 2 && (mf.includes(kf) || kf.includes(mf))) {
          return true
        }
      }
    }
  }
  return false
}

function isCounted(transaction: Transaction): boolean {
  return !transaction.excluded && transaction.amount > 0
}

function singleTransactionRawBenefit(rule: BenefitRule, amount: number): number {
  const base =
    rule.fixedBenefit && rule.fixedBenefit > 0
      ? Math.min(rule.fixedBenefit, amount)
      : Math.round(amount * rule.rate)
  if (rule.maxBenefitPerTx && rule.maxBenefitPerTx > 0) {
    return Math.min(base, rule.maxBenefitPerTx)
  }
  return base
}

function ruleMatchesTransactionCategory(
  rule: BenefitRule,
  transaction: Transaction,
): boolean {
  if (rule.id === 'ibk-kpass-transport') {
    return (
      rule.categoryId === transaction.categoryId &&
      !isGeneralTransportTransaction(transaction)
    )
  }
  if (rule.id === 'ibk-kpass-travel') {
    return (
      (transaction.categoryId === 'transport' ||
        transaction.categoryId === 'travel') &&
      isGeneralTransportTransaction(transaction)
    )
  }
  return (
    rule.categoryId === transaction.categoryId &&
    ruleMatchesMerchant(rule, transaction.merchant, transaction.memo)
  )
}

/**
 * 카테고리 혜택을 우선 적용하고, 카테고리 혜택이 없을 때만 결제수단 혜택을 찾는다.
 * 같은 카테고리에 가맹점 지정 혜택과 일반 혜택이 함께 있으면 가맹점 지정 혜택을 우선한다.
 */
function ruleForTransaction(
  rules: BenefitRule[],
  transaction: Transaction,
): BenefitRule | null {
  const categoryMatches = rules.filter((rule) =>
    ruleMatchesTransactionCategory(rule, transaction),
  )
  if (categoryMatches.length > 0) {
    return (
      categoryMatches.find((rule) => (rule.merchants?.length ?? 0) > 0) ??
      categoryMatches[0]
    )
  }

  const methodMatches = rules.filter(
    (rule) =>
      rule.paymentMethods?.includes(transaction.paymentMethod ?? '') &&
      ruleMatchesMerchant(rule, transaction.merchant, transaction.memo),
  )
  if (methodMatches.length > 0) {
    return (
      methodMatches.find((rule) => (rule.merchants?.length ?? 0) > 0) ??
      methodMatches[0]
    )
  }

  return null
}

/** 화면에서 거래별 혜택 조건을 안내할 때 사용하는 규칙 찾기. */
export function benefitRuleForTransaction(
  card: Card,
  transaction: Transaction,
): BenefitRule | null {
  return ruleForTransaction(card.benefits, transaction)
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
  const inGracePeriod =
    (card.gracePeriodMonths?.includes(month) ?? false) &&
    prevSpend < card.minSpendForBenefits
  const effectivePrevSpend = inGracePeriod
    ? Math.max(prevSpend, card.minSpendForBenefits)
    : prevSpend
  const performanceMet = inGracePeriod || prevSpend >= card.minSpendForBenefits
  const performanceTier = matchedPerformanceTier(card, effectivePrevSpend)
  const totalCap = performanceTier?.monthlyTotalCap ?? card.monthlyTotalCap

  const applicableRules = performanceMet
    ? card.benefits.filter(
        (rule) => effectivePrevSpend >= (rule.minSpend ?? card.minSpendForBenefits),
      )
    : []

  const ruleSpend = new Map<string, number>(
    applicableRules.map((rule) => [rule.id, 0]),
  )
  const ruleRaw = new Map<string, number>(
    applicableRules.map((rule) => [rule.id, 0]),
  )
  const ruleCount = new Map<string, number>(
    applicableRules.map((rule) => [rule.id, 0]),
  )
  const countedByRule = new Set<Transaction>()

  for (const transaction of monthTransactions) {
    if (isExcludedFromBenefit(transaction)) {
      // 실적 채움용 결제(문화상품권 등)는 실적으로 인정되나 카드사 혜택(할인/적립) 계산 대상에서는 제외
      continue
    }

    const rule = ruleForTransaction(applicableRules, transaction)
    if (!rule) continue

    // 카테고리/결제수단 혜택에 잡힌 결제는 기본 적립에서 제외한다.
    countedByRule.add(transaction)
    if (
      rule.id === 'ibk-kpass-travel' &&
      isTaxiTransaction(transaction) &&
      transaction.paymentMethod !== '신용카드'
    ) {
      // 택시 앱 결제/간편결제는 일반교통 할인 제외 (실물 신용카드 현장결제만 인정)
      continue
    }
    if (rule.minTransactionAmount && transaction.amount < rule.minTransactionAmount) {
      continue
    }
    const currentCount = ruleCount.get(rule.id) ?? 0
    if (rule.maxCountPerMonth && currentCount >= rule.maxCountPerMonth) {
      continue
    }

    const txRaw = singleTransactionRawBenefit(rule, transaction.amount)
    ruleSpend.set(rule.id, (ruleSpend.get(rule.id) ?? 0) + transaction.amount)
    ruleRaw.set(rule.id, (ruleRaw.get(rule.id) ?? 0) + txRaw)
    ruleCount.set(rule.id, currentCount + 1)
  }

  const rows: RuleUsage[] = applicableRules.map((rule) => {
    const categorySpend = ruleSpend.get(rule.id) ?? 0
    const raw = ruleRaw.get(rule.id) ?? 0
    const applied = Math.min(raw, rule.monthlyCap)
    return {
      rule,
      spend: categorySpend,
      raw,
      applied,
      capLeft: Math.max(0, rule.monthlyCap - applied),
      count: ruleCount.get(rule.id) ?? 0,
    }
  })

  const baseSpend =
    performanceMet && card.baseRate > 0
      ? monthTransactions.reduce((total, transaction) => {
          if (isExcludedFromBenefit(transaction)) return total
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
    inGracePeriod,
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

export type RecommendPaymentMode = 'auto' | 'card' | 'simplepay'

export interface RecommendationInput {
  categoryId: CategoryId
  amount: number
  merchant?: string
  paymentMethod?: string
  paymentMode?: RecommendPaymentMode
}

export type RecommendationBadgeTone = 'accent' | 'success' | 'warn' | 'neutral'

export interface Recommendation {
  card: Card
  before: CardMonth
  after: CardMonth
  gain: number
  eligible: boolean
  matchedRule: BenefitRule | null
  recommendedPaymentMethod: string
  reason: string
  detailNote?: string
  strategyBadge?: {
    label: string
    tone: RecommendationBadgeTone
  }
  partiallyCapped?: boolean
}

export interface MerchantOpportunity {
  merchant: string
  cardId: string
  cardName: string
  gain: number
  rate: number
  fixedBenefit?: number
}

interface CardEventProgress {
  pending: boolean
  remainingAmount: number
  needsSimplePay: boolean
  minSimplePayAmount: number
}

function cardEventProgress(
  card: Card,
  transactions: Transaction[],
  month: string,
): CardEventProgress {
  const cardEvent = card.event
  if (!cardEvent || `${month}-01` > cardEvent.deadline) {
    return {
      pending: false,
      remainingAmount: 0,
      needsSimplePay: false,
      minSimplePayAmount: 10_000,
    }
  }

  const eventTransactions = transactions.filter(
    (t) =>
      t.cardId === card.id &&
      t.date >= '2026-11-01' &&
      t.date <= cardEvent.deadline &&
      !t.excluded &&
      t.amount > 0,
  )
  const eventTotalSpend = eventTransactions.reduce((sum, t) => sum + t.amount, 0)
  const minSimplePay = cardEvent.minSimplePayAmount ?? 10_000
  const hasSimplePayMet = cardEvent.requireSimplePay
    ? eventTransactions.some(
        (t) => t.paymentMethod === '간편결제' && t.amount >= minSimplePay,
      )
    : true
  const remainingAmount = Math.max(0, cardEvent.targetAmount - eventTotalSpend)
  const needsSimplePay = Boolean(cardEvent.requireSimplePay && !hasSimplePayMet)
  return {
    pending: remainingAmount > 0 || needsSimplePay,
    remainingAmount,
    needsSimplePay,
    minSimplePayAmount: minSimplePay,
  }
}

interface InternalRecommendation extends Recommendation {
  _eventPending: boolean
  _eventRemaining: number
  _needsBasePerf: boolean
  _needsNextTier: boolean
}

/**
 * 결제 1건을 각 카드에 가상으로 넣어보고 혜택 증가분과 전략적 우선순위를 비교한다.
 * 가맹점 조건, 결제방식(일반/간편결제), 건당/월 한도, 실적·이벤트 조건을 모두 반영한다.
 */
export function recommendCards(
  cards: Card[],
  transactions: Transaction[],
  month: string,
  input: RecommendationInput,
): Recommendation[] {
  const amount = Math.max(0, Math.round(input.amount))
  const simulationDate = `${month}-01`
  const trimmedMerchant = input.merchant?.trim() || ''
  const paymentMode: RecommendPaymentMode =
    input.paymentMode ?? (input.paymentMethod === '간편결제' ? 'simplepay' : 'auto')
  const results: InternalRecommendation[] = []

  for (const card of cards) {
    if (!card.active) continue
    const before = computeCardMonth(card, transactions, month)
    const defaultMethod = card.kind === 'check' ? '체크카드' : '신용카드'
    const eventState = cardEventProgress(card, transactions, month)

    const candidateMethods =
      paymentMode === 'simplepay'
        ? ['간편결제']
        : paymentMode === 'card'
          ? [
              input.paymentMethod && input.paymentMethod !== '간편결제'
                ? input.paymentMethod
                : defaultMethod,
            ]
          : [defaultMethod, '간편결제']

    const candidates = candidateMethods.map((method) => {
      const simulated: Transaction = {
        id: '__simulation__',
        date: simulationDate,
        merchant: trimmedMerchant,
        amount,
        categoryId: input.categoryId,
        cardId: card.id,
        paymentMethod: method,
      }
      const after = computeCardMonth(card, [...transactions, simulated], month)
      const gain = Math.max(0, after.totalBenefit - before.totalBenefit)
      const targetRule = ruleForTransaction(card.benefits, simulated)
      const applicable = targetRule
        ? before.rows.find((row) => row.rule.id === targetRule.id) ?? null
        : null
      const afterRow = targetRule
        ? after.rows.find((row) => row.rule.id === targetRule.id) ?? null
        : null
      return {
        method,
        simulated,
        after,
        gain,
        targetRule,
        applicable,
        afterRow,
      }
    })

    const bestCandidate = candidates.reduce((best, curr) => {
      if (curr.gain !== best.gain) return curr.gain > best.gain ? curr : best
      const currPrefersSimplePay =
        curr.method === '간편결제' &&
        ((eventState.needsSimplePay && amount >= eventState.minSimplePayAmount) ||
          Boolean(curr.targetRule?.paymentMethods?.includes('간편결제')))
      const bestPrefersSimplePay =
        best.method === '간편결제' &&
        ((eventState.needsSimplePay && amount >= eventState.minSimplePayAmount) ||
          Boolean(best.targetRule?.paymentMethods?.includes('간편결제')))
      if (currPrefersSimplePay !== bestPrefersSimplePay) {
        return currPrefersSimplePay ? curr : best
      }
      return best.method === defaultMethod ? best : curr
    })

    const {
      method: recommendedPaymentMethod,
      simulated,
      after,
      gain,
      targetRule,
      applicable,
      afterRow,
    } = bestCandidate
    const matchedRule = applicable?.rule ?? targetRule

    const ruleLabel = matchedRule
      ? matchedRule.paymentMethods?.includes(simulated.paymentMethod ?? '') &&
        matchedRule.categoryId !== input.categoryId
        ? simulated.paymentMethod ?? '간편결제'
        : categoryOf(matchedRule.categoryId).label
      : categoryOf(input.categoryId).label

    let reason = ''
    let detailNote: string | undefined
    let strategyBadge: Recommendation['strategyBadge']
    let partiallyCapped = false

    const needsBasePerf =
      !before.inGracePeriod && card.minSpendForBenefits > 0 && before.toRequirement > 0
    const needsNextTier = !needsBasePerf && before.nextTierRemaining > 0

    if (!before.performanceMet) {
      reason = `전월 실적 ${wonShort(before.card.minSpendForBenefits)} 미달`
    } else if (applicable) {
      const rule = applicable.rule
      if (
        rule.id === 'ibk-kpass-travel' &&
        isTaxiTransaction(simulated) &&
        simulated.paymentMethod !== '신용카드'
      ) {
        reason = '택시는 실물 신용카드 현장결제만 5% 할인 적용 (간편결제·앱결제 제외)'
      } else if (rule.minTransactionAmount && amount < rule.minTransactionAmount) {
        reason = `건당 ${won(rule.minTransactionAmount)} 이상 결제 시 적용`
      } else if (rule.maxCountPerMonth && applicable.count >= rule.maxCountPerMonth) {
        reason = `${ruleLabel} 월 ${rule.maxCountPerMonth}회 한도 소진`
      } else if (gain > 0) {
        const rawTxBenefit = singleTransactionRawBenefit(rule, amount)
        partiallyCapped = rawTxBenefit > gain
        const rateOrFixed =
          rule.fixedBenefit && rule.fixedBenefit > 0
            ? `${won(rule.fixedBenefit)} 정액`
            : ratePercent(rule.rate)
        const perTxNote =
          rule.maxBenefitPerTx && rule.maxBenefitPerTx > 0 && !(rule.fixedBenefit && rule.fixedBenefit > 0)
            ? ` (건당 최대 ${wonShort(rule.maxBenefitPerTx)})`
            : ''
        reason = `${ruleLabel} ${rateOrFixed}${perTxNote} · +${won(gain)}`

        const remainingCapAfter = Math.min(afterRow?.capLeft ?? 0, after.capLeft)
        const parts: string[] = []
        if (partiallyCapped) {
          parts.push(`남은 한도 ${won(gain)}까지만 적용 (한도 소진)`)
        } else {
          parts.push(`이번 달 남은 한도 ${won(remainingCapAfter)}`)
        }
        if (rule.merchants && rule.merchants.length > 0) {
          parts.push(`${rule.merchants.slice(0, 3).join('·')} 전용`)
        }
        detailNote = parts.join(' · ')
      } else if (before.capLeft <= 0) {
        reason = '이번 달 통합 한도 소진'
      } else {
        reason = `${ruleLabel} 한도 소진`
      }
    } else if (
      targetRule?.minSpend &&
      (before.inGracePeriod
        ? Math.max(before.prevSpend, card.minSpendForBenefits)
        : before.prevSpend) < targetRule.minSpend
    ) {
      reason = `전월 ${wonShort(targetRule.minSpend)} 실적 필요`
    } else if (gain > 0) {
      const rawBase = Math.round(amount * before.card.baseRate)
      partiallyCapped = rawBase > gain
      reason = `기본 적립 ${ratePercent(before.card.baseRate)} · +${won(gain)}`
      const baseCapLeftAfter = Math.max(0, before.card.baseCap - after.baseApplied)
      const remainingAfter = Math.min(baseCapLeftAfter, after.capLeft)
      detailNote = partiallyCapped
        ? `남은 한도 ${won(gain)}까지만 적용 (한도 소진)`
        : `이번 달 남은 한도 ${won(remainingAfter)}`
    } else if (before.capLeft <= 0) {
      reason = '이번 달 혜택 한도 소진'
    } else {
      // card 모드 강제 시 간편결제 혜택 가능 여부 안내
      let simplePayHintRule: BenefitRule | null = null
      let simplePayHintGain = 0
      if (paymentMode === 'card') {
        const spSim: Transaction = {
          ...simulated,
          paymentMethod: '간편결제',
        }
        const spAfter = computeCardMonth(card, [...transactions, spSim], month)
        simplePayHintGain = Math.max(0, spAfter.totalBenefit - before.totalBenefit)
        if (simplePayHintGain > 0) {
          simplePayHintRule = ruleForTransaction(card.benefits, spSim)
        }
      }

      if (simplePayHintRule) {
        const hintAmount =
          simplePayHintRule.fixedBenefit && simplePayHintRule.fixedBenefit > 0
            ? won(simplePayHintRule.fixedBenefit)
            : ratePercent(simplePayHintRule.rate)
        reason = `간편결제 선택 시 ${hintAmount} 혜택 가능`
      } else if (simplePayHintGain > 0) {
        reason = `간편결제 선택 시 +${won(simplePayHintGain)} 혜택 가능`
      } else {
        const merchantRestricted = card.benefits.filter(
          (r) =>
            r.categoryId === input.categoryId &&
            (r.merchants?.length ?? 0) > 0 &&
            !ruleMatchesMerchant(r, trimmedMerchant),
        )
        if (merchantRestricted.length > 0) {
          const names = [...new Set(merchantRestricted.flatMap((r) => r.merchants ?? []))]
          reason = `${names.slice(0, 3).join('·')}${names.length > 3 ? ' 등' : ''} 전용 혜택만 있어요`
        } else {
          reason = '이 업종 직접 할인 없음'
        }
      }
    }

    if (gain > 0) {
      const isSimplePayWinner =
        recommendedPaymentMethod === '간편결제' &&
        (Boolean(matchedRule?.paymentMethods?.includes('간편결제')) ||
          candidates.some((c) => c.method !== '간편결제' && c.gain < gain))
      strategyBadge = isSimplePayWinner
        ? { label: '⚡ 간편결제 시', tone: 'accent' }
        : { label: `💳 ${defaultMethod}`, tone: 'neutral' }
    } else {
      if (eventState.pending) {
        strategyBadge = { label: '🎁 이벤트 채우기 추천', tone: 'warn' }
        if (eventState.remainingAmount > 0) {
          detailNote = `이벤트 달성까지 ${won(eventState.remainingAmount)} 남음${
            eventState.needsSimplePay ? ` · 간편결제 ${wonShort(eventState.minSimplePayAmount)}↑ 필요` : ''
          }`
        } else if (eventState.needsSimplePay) {
          detailNote = `간편결제 ${wonShort(eventState.minSimplePayAmount)} 이상 1건 결제 시 이벤트 완료`
        }
      } else if (needsBasePerf) {
        strategyBadge = { label: '🎯 실적 채우기 추천', tone: 'neutral' }
        detailNote = `이번 달 ${won(before.toRequirement)} 더 쓰면 다음 달 혜택 충족`
      } else if (needsNextTier) {
        strategyBadge = { label: '📈 한도 상향 구간 임박', tone: 'neutral' }
        detailNote = `다음 한도 구간까지 ${won(before.nextTierRemaining)} 남음`
      }
    }

    results.push({
      card,
      before,
      after,
      gain,
      eligible: before.performanceMet,
      matchedRule,
      recommendedPaymentMethod,
      reason,
      detailNote,
      strategyBadge,
      partiallyCapped,
      _eventPending: eventState.pending,
      _eventRemaining: eventState.remainingAmount,
      _needsBasePerf: needsBasePerf,
      _needsNextTier: needsNextTier,
    })
  }

  return results
    .sort((a, b) => {
      if (b.gain !== a.gain) return b.gain - a.gain

      if (a._eventPending !== b._eventPending) {
        return a._eventPending ? -1 : 1
      }
      if (a._eventPending && b._eventPending && a._eventRemaining !== b._eventRemaining) {
        return a._eventRemaining - b._eventRemaining
      }

      if (a._needsBasePerf !== b._needsBasePerf) {
        return a._needsBasePerf ? -1 : 1
      }
      if (a._needsBasePerf && b._needsBasePerf && a.before.toRequirement !== b.before.toRequirement) {
        return a.before.toRequirement - b.before.toRequirement
      }

      if (a._needsNextTier !== b._needsNextTier) {
        return a._needsNextTier ? -1 : 1
      }
      if (
        a._needsNextTier &&
        b._needsNextTier &&
        a.before.nextTierRemaining !== b.before.nextTierRemaining
      ) {
        return a.before.nextTierRemaining - b.before.nextTierRemaining
      }

      if (b.before.performanceMet !== a.before.performanceMet) {
        return Number(b.before.performanceMet) - Number(a.before.performanceMet)
      }
      return b.after.effectiveRate - a.after.effectiveRate
    })
    .map(({ _eventPending, _eventRemaining, _needsBasePerf, _needsNextTier, ...rest }) => rest)
}

export function merchantChipsForCategory(
  cards: Card[],
  categoryId: CategoryId,
): string[] {
  const seen = new Set<string>()
  const chips: string[] = []
  for (const card of cards) {
    if (!card.active) continue
    for (const rule of card.benefits) {
      if (rule.categoryId !== categoryId || !rule.merchants) continue
      for (const merchant of rule.merchants) {
        const key = normalizeText(merchant)
        if (!key || seen.has(key)) continue
        seen.add(key)
        chips.push(merchant)
      }
    }
  }
  return chips
}

export function merchantOpportunitiesForCategory(
  cards: Card[],
  transactions: Transaction[],
  month: string,
  input: {
    categoryId: CategoryId
    amount: number
    paymentMode: RecommendPaymentMode
  },
  bestGeneralGain: number,
): MerchantOpportunity[] {
  if (input.amount <= 0) return []
  const chips = merchantChipsForCategory(cards, input.categoryId)
  const opportunities: MerchantOpportunity[] = []

  for (const merchant of chips) {
    const recs = recommendCards(cards, transactions, month, {
      categoryId: input.categoryId,
      amount: input.amount,
      merchant,
      paymentMode: input.paymentMode,
    })
    const top = recs[0]
    if (top && top.gain > bestGeneralGain && top.gain > 0) {
      opportunities.push({
        merchant,
        cardId: top.card.id,
        cardName: top.card.name,
        gain: top.gain,
        rate: top.matchedRule?.rate ?? 0,
        fixedBenefit: top.matchedRule?.fixedBenefit,
      })
    }
  }

  return opportunities.sort((a, b) => b.gain - a.gain)
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

export function sortCards(
  cards: Card[],
  transactions: Transaction[],
  month: string,
  options?: {
    mode?: CardSortMode
    favoriteCardIds?: string[]
  },
): Card[] {
  const mode = options?.mode ?? 'requirement'
  const favorites = new Set(options?.favoriteCardIds ?? [])

  const metrics = new Map<
    string,
    {
      spend: number
      toRequirement: number
      nextTierRemaining: number
      minSpend: number
    }
  >()

  for (const card of cards) {
    const cardMonth = computeCardMonth(card, transactions, month)
    metrics.set(card.id, {
      spend: cardMonth.spend,
      toRequirement: cardMonth.toRequirement,
      nextTierRemaining: cardMonth.nextTierRemaining,
      minSpend: card.minSpendForBenefits,
    })
  }

  return [...cards].sort((a, b) => {
    // 1. 활성 카드가 비활성(숨김) 카드보다 항상 앞
    if (a.active !== b.active) return a.active ? -1 : 1

    // 2. 즐겨찾기 카드가 일반 카드보다 항상 앞
    const aFav = favorites.has(a.id)
    const bFav = favorites.has(b.id)
    if (aFav !== bFav) return aFav ? -1 : 1

    // 3. 선택된 모드에 따른 정렬
    const aMeta = metrics.get(a.id) ?? {
      spend: 0,
      toRequirement: 0,
      nextTierRemaining: 0,
      minSpend: 0,
    }
    const bMeta = metrics.get(b.id) ?? {
      spend: 0,
      toRequirement: 0,
      nextTierRemaining: 0,
      minSpend: 0,
    }

    if (mode === 'spend') {
      // 결제 많은 순: 이번 달 결제액(spend) 내림차순
      if (bMeta.spend !== aMeta.spend) return bMeta.spend - aMeta.spend
      return a.name.localeCompare(b.name, 'ko')
    }

    if (mode === 'requirement') {
      // 실적 임박순:
      // (1) 실적 조건이 있으면서 아직 미충족인 카드 중 남은 금액이 적은 순 (toRequirement 오름차순)
      // (2) 실적 조건이 있으면서 다음 티어가 남아있는 카드 (nextTierRemaining 오름차순)
      // (3) 기본 실적을 충족한 카드
      // (4) 실적 조건이 없는 카드 (minSpend === 0)
      const aNeeds = aMeta.minSpend > 0 && aMeta.toRequirement > 0
      const bNeeds = bMeta.minSpend > 0 && bMeta.toRequirement > 0

      if (aNeeds && bNeeds) {
        if (aMeta.toRequirement !== bMeta.toRequirement) {
          return aMeta.toRequirement - bMeta.toRequirement
        }
      } else if (aNeeds !== bNeeds) {
        return aNeeds ? -1 : 1
      } else {
        const aHasCond = aMeta.minSpend > 0
        const bHasCond = bMeta.minSpend > 0

        if (aHasCond && bHasCond) {
          const aNext = aMeta.nextTierRemaining > 0
          const bNext = bMeta.nextTierRemaining > 0
          if (aNext && bNext) {
            if (aMeta.nextTierRemaining !== bMeta.nextTierRemaining) {
              return aMeta.nextTierRemaining - bMeta.nextTierRemaining
            }
          } else if (aNext !== bNext) {
            return aNext ? -1 : 1
          }
        } else if (aHasCond !== bHasCond) {
          return aHasCond ? -1 : 1
        }
      }

      // 동률이면 결제액 많은 순, 그 다음 이름순
      if (bMeta.spend !== aMeta.spend) return bMeta.spend - aMeta.spend
      return a.name.localeCompare(b.name, 'ko')
    }

    // default: 가나다 이름순
    return a.name.localeCompare(b.name, 'ko')
  })
}
