export type CategoryId =
  | 'food'
  | 'cafe'
  | 'mart'
  | 'delivery'
  | 'shopping'
  | 'simplepay'
  | 'transport'
  | 'fuel'
  | 'telecom'
  | 'subscription'
  | 'travel'
  | 'culture'
  | 'medical'
  | 'living'
  | 'education'
  | 'etc'

export interface Category {
  id: CategoryId
  label: string
  emoji: string
  color: string
}

export interface BenefitRule {
  id: string
  categoryId: CategoryId
  /** 0.1 = 10% */
  rate: number
  /** 월 할인/적립 한도(원) */
  monthlyCap: number
  /** 이 혜택이 열리는 전월 실적(원). 없으면 카드 기본 실적 기준 */
  minSpend?: number
  /** 건당 최소 결제 금액(원). 이 금액 미만 결제는 혜택 계산에서 제외 */
  minTransactionAmount?: number
  /** 카테고리와 별개로 혜택 대상에 포함할 결제수단 (예: 간편결제) */
  paymentMethods?: string[]
  note?: string
}

export type CardKind = 'credit' | 'check'

export interface PerformanceTier {
  /** 이 구간이 적용되는 전월 실적 기준(원) */
  minSpend: number
  /** 이 구간의 월 통합 할인/적립 한도(원) */
  monthlyTotalCap: number
}

export interface Card {
  id: string
  name: string
  issuer: string
  kind: CardKind
  colorFrom: string
  colorTo: string
  /** 혜택을 받기 위한 전월 실적 기준(원) */
  minSpendForBenefits: number
  /** 월 통합 할인/적립 한도(원). 전월 실적 구간에 해당하지 않을 때 사용 */
  monthlyTotalCap: number
  /** 전월 실적 구간별 통합 한도. 없으면 monthlyTotalCap을 모든 구간에 사용 */
  performanceTiers?: PerformanceTier[]
  /** 기본 적립률 */
  baseRate: number
  /** 기본 적립 월 한도(원) */
  baseCap: number
  benefits: BenefitRule[]
  active: boolean
}

export interface Transaction {
  id: string
  /** YYYY-MM-DD */
  date: string
  merchant: string
  amount: number
  categoryId: CategoryId
  /** null 이면 현금/계좌 결제 */
  cardId: string | null
  memo?: string
  /** 실적/혜택 계산에서 제외 */
  excluded?: boolean
  /** 시트의 거래유형(대분류). 예: 생활비, 대출상환 */
  categoryMajor?: string
  /** 시트의 분류(소분류). 예: 주거, 차입원금상환 */
  categoryMinor?: string
  /** 시트의 집계 위치. 예: 생활비, 집계 제외 */
  categoryGroup?: string
  /** 시트의 보정 금액 */
  correction?: number
  /** 금액 + 보정 */
  effectiveAmount?: number
  /** 시트의 결제수단 */
  paymentMethod?: string
  /** 시트의 비고 */
  note?: string
  status?: 'active' | 'canceled'
  source?: string
  /** 고정지출 규칙에서 반영된 거래면 해당 규칙 ID */
  fixedExpenseId?: string
  /** 고정지출을 반영한 대상 월 (YYYY-MM) */
  fixedExpenseMonth?: string
}

/**
 * 고정지출 규칙. `transactions`에 실제 거래로 반영되기 전까지는
 * 지출로 집계하지 않습니다.
 */
export interface FixedExpense {
  id: string
  name: string
  amount: number
  /** 앱에서 보여줄 카테고리 */
  categoryId: CategoryId
  /** 시트 분류 대분류. 예: 생활비, 투자납입, 대출상환 */
  categoryMajor: string
  /** 시트 분류 소분류. 예: 주거, IRP·연금, 차입원금상환 */
  categoryMinor: string
  /** 집계 위치. 예: 생활비, 투자납입, 대출상환 */
  categoryGroup: string
  /** null 이면 현금/계좌 */
  cardId: string | null
  paymentMethod?: string
  /** 1~31. 31은 말일로 계산 */
  dayOfMonth: number
  /** YYYY-MM */
  startMonth?: string
  /** YYYY-MM */
  endMonth?: string
  memo?: string
  note?: string
  active: boolean
}

/** 특정 월에 고정지출이 실제 거래로 반영된 기록 */
export interface FixedExpenseApplication {
  fixedExpenseId: string
  /** YYYY-MM */
  month: string
  transactionId: string
  /** 실제 결제일 (YYYY-MM-DD) */
  date: string
  amount: number
}

export interface Settings {
  monthlyIncome: number
  monthlyBudget: number
  /** 월 저축 목표 */
  monthlyGoal: number
  categoryBudgets: Partial<Record<CategoryId, number>>
}

export interface AppState {
  version: number
  cards: Card[]
  transactions: Transaction[]
  settings: Settings
}
