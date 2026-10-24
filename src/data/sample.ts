import type { AppState, FixedExpense, Transaction } from '../types'
import { createCards, DEFAULT_SETTINGS } from './cards'

/**
 * 9월 전월 실적 기준 충족용 샘플 결제 내역.
 * 로컬 개발/체험 환경에서 카드별 혜택이 정상적으로 시뮬레이션되도록 지원합니다.
 */
export const DEFAULT_PREV_MONTH_TRANSACTIONS: Transaction[] = [
  {
    id: 'sample-prev-mg-plus-s',
    date: '2026-09-15',
    merchant: '이마트 강남점',
    amount: 1000000,
    categoryId: 'mart',
    cardId: 'mg-plus-s-hana',
    paymentMethod: '신용카드',
    categoryMajor: '생활비',
    categoryMinor: '마트',
    memo: '9월 실적 충족 (100만 구간 · 통합한도 6만)',
    status: 'active',
  },
  {
    id: 'sample-prev-mg-honey',
    date: '2026-09-18',
    merchant: '쿠팡 로켓배송',
    amount: 150000,
    categoryId: 'shopping',
    cardId: 'mg-honey-check',
    paymentMethod: '체크카드',
    categoryMajor: '생활비',
    categoryMinor: '쇼핑',
    memo: '9월 실적 충족 (10만 기준)',
    status: 'active',
  },
  {
    id: 'sample-prev-woori-skt',
    date: '2026-09-20',
    merchant: 'SKT 통신요금',
    amount: 320000,
    categoryId: 'telecom',
    cardId: 'woori-skt',
    paymentMethod: '신용카드',
    categoryMajor: '생활비',
    categoryMinor: '통신',
    memo: '9월 실적 충족 (30만 기준)',
    status: 'active',
  },
]

/**
 * 로컬 개발 및 테스트를 위한 고정지출·저축 기본 템플릿 목록.
 */
export const DEFAULT_FIXED_EXPENSES: FixedExpense[] = [
  {
    id: 'sample-fixed-rent',
    name: '아파트 관리비',
    amount: 220000,
    categoryId: 'living',
    categoryMajor: '생활비',
    categoryMinor: '생활',
    categoryGroup: '생활비',
    cardId: null,
    paymentMethod: '자동이체',
    dayOfMonth: 25,
    active: true,
    memo: '매월 25일 자동이체',
  },
  {
    id: 'sample-fixed-telecom',
    name: 'SKT 휴대폰 요금',
    amount: 65000,
    categoryId: 'telecom',
    categoryMajor: '생활비',
    categoryMinor: '통신',
    categoryGroup: '생활비',
    cardId: 'woori-skt',
    paymentMethod: '신용카드',
    dayOfMonth: 15,
    active: true,
    memo: 'SKT 우리카드 통신비 할인 적용',
  },
  {
    id: 'sample-fixed-youtube',
    name: '유튜브 프리미엄',
    amount: 14900,
    categoryId: 'subscription',
    categoryMajor: '생활비',
    categoryMinor: '구독',
    categoryGroup: '생활비',
    cardId: 'mg-plus-s-hana',
    paymentMethod: '신용카드',
    dayOfMonth: 10,
    active: true,
    memo: 'MG+ S 하나카드 구독 50% 할인 대상',
  },
  {
    id: 'sample-fixed-insurance',
    name: '실손의료보험료',
    amount: 48000,
    categoryId: 'medical',
    categoryMajor: '생활비',
    categoryMinor: '건강',
    categoryGroup: '생활비',
    cardId: 'mg-plus-s-hana',
    paymentMethod: '신용카드',
    dayOfMonth: 20,
    active: true,
    memo: '실적 제외 항목',
  },
  {
    id: 'sample-fixed-savings-irp',
    name: '청년도약계좌 IRP',
    amount: 500000,
    categoryId: 'savings',
    categoryMajor: '투자납입',
    categoryMinor: 'IRP·연금',
    categoryGroup: '투자납입',
    cardId: null,
    paymentMethod: '자동이체',
    dayOfMonth: 25,
    active: true,
    memo: '매월 정기 고정 저축',
  },
]

/**
 * 기본 가계부 초기 상태.
 */
export function createInitialState(): AppState {
  return {
    version: 1,
    cards: createCards(),
    transactions: [...DEFAULT_PREV_MONTH_TRANSACTIONS],
    settings: {
      ...DEFAULT_SETTINGS,
      categoryBudgets: { ...DEFAULT_SETTINGS.categoryBudgets },
    },
  }
}
