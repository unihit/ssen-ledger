import type { Card, Settings } from '../types'

/**
 * 예시 카드 4종. 실제 카드사 상품의 약관이 아니라,
 * 앱의 실적/혜택 계산을 보여주기 위한 샘플 조건입니다.
 * 카드 화면에서 조건을 직접 수정할 수 있습니다.
 */
export function createCards(): Card[] {
  return [
    {
      id: 'ssen-light',
      name: '쎈카드 라이트',
      issuer: '쎈카드',
      kind: 'credit',
      colorFrom: '#4f8cff',
      colorTo: '#1f5ae0',
      minSpendForBenefits: 200_000,
      monthlyTotalCap: 30_000,
      baseRate: 0,
      baseCap: 0,
      active: true,
      benefits: [
        {
          id: 'light-cafe',
          categoryId: 'cafe',
          rate: 0.1,
          monthlyCap: 5_000,
          note: '커피·베이커리 10% 할인',
        },
        {
          id: 'light-delivery',
          categoryId: 'delivery',
          rate: 0.1,
          monthlyCap: 10_000,
          note: '배달앱 10% 할인',
        },
        {
          id: 'light-transport',
          categoryId: 'transport',
          rate: 0.1,
          monthlyCap: 10_000,
          note: '대중교통 10% 할인',
        },
        {
          id: 'light-mart',
          categoryId: 'mart',
          rate: 0.05,
          monthlyCap: 5_000,
          minSpend: 400_000,
          note: '전월 40만원 이상 시 마트 5%',
        },
      ],
    },
    {
      id: 'ssen-plus',
      name: '쎈카드 플러스',
      issuer: '쎈카드',
      kind: 'credit',
      colorFrom: '#7c5cff',
      colorTo: '#4b2ed6',
      minSpendForBenefits: 300_000,
      monthlyTotalCap: 50_000,
      baseRate: 0,
      baseCap: 0,
      active: true,
      benefits: [
        {
          id: 'plus-shopping',
          categoryId: 'shopping',
          rate: 0.1,
          monthlyCap: 20_000,
          note: '온라인 쇼핑 10% 할인',
        },
        {
          id: 'plus-food',
          categoryId: 'food',
          rate: 0.05,
          monthlyCap: 10_000,
          note: '외식 5% 할인',
        },
        {
          id: 'plus-fuel',
          categoryId: 'fuel',
          rate: 0.1,
          monthlyCap: 10_000,
          note: '주유·차량 10% 할인',
        },
        {
          id: 'plus-telecom',
          categoryId: 'telecom',
          rate: 0.05,
          monthlyCap: 5_000,
          note: '통신요금 5% 할인',
        },
        {
          id: 'plus-living',
          categoryId: 'living',
          rate: 0.05,
          monthlyCap: 5_000,
          note: '생활용품 5% 할인',
        },
      ],
    },
    {
      id: 'ssen-travel',
      name: '쎈카드 트래블',
      issuer: '쎈카드',
      kind: 'credit',
      colorFrom: '#19b8a6',
      colorTo: '#0b7f7a',
      minSpendForBenefits: 300_000,
      monthlyTotalCap: 40_000,
      baseRate: 0,
      baseCap: 0,
      active: true,
      benefits: [
        {
          id: 'travel-travel',
          categoryId: 'travel',
          rate: 0.05,
          monthlyCap: 30_000,
          note: '항공·숙박 5% 적립',
        },
        {
          id: 'travel-shopping',
          categoryId: 'shopping',
          rate: 0.03,
          monthlyCap: 6_000,
          note: '면세·쇼핑 3% 적립',
        },
        {
          id: 'travel-transport',
          categoryId: 'transport',
          rate: 0.05,
          monthlyCap: 4_000,
          note: '공항철도·대중교통 5%',
        },
      ],
    },
    {
      id: 'ssen-check',
      name: '쎈 체크',
      issuer: '쎈카드',
      kind: 'check',
      colorFrom: '#64748b',
      colorTo: '#334155',
      minSpendForBenefits: 0,
      monthlyTotalCap: 20_000,
      baseRate: 0.015,
      baseCap: 10_000,
      active: true,
      benefits: [
        {
          id: 'check-cafe',
          categoryId: 'cafe',
          rate: 0.05,
          monthlyCap: 3_000,
          note: '카페 5% 캐시백',
        },
        {
          id: 'check-transport',
          categoryId: 'transport',
          rate: 0.1,
          monthlyCap: 5_000,
          note: '대중교통 10% 캐시백',
        },
      ],
    },
  ]
}

/**
 * MG+ S 하나카드 실제 약관 기반 예시.
 * 2025-10-18 신규 신청 중단. 기존 카드 보유자 약관 기준으로 입력했습니다.
 * 간편결제는 결제수단 기준이라 거래를 '간편결제' 카테고리로 분류해야 정확히 계산됩니다.
 */
export const MG_PLUS_S_CARD: Card = {
  id: 'mg-plus-s-hana',
  name: 'MG+ S 하나카드',
  issuer: '하나카드 · MG새마을금고',
  kind: 'credit',
  colorFrom: '#0f9d8a',
  colorTo: '#0b5f8a',
  minSpendForBenefits: 300_000,
  monthlyTotalCap: 15_000,
  performanceTiers: [
    { minSpend: 300_000, monthlyTotalCap: 15_000 },
    { minSpend: 600_000, monthlyTotalCap: 30_000 },
    { minSpend: 1_000_000, monthlyTotalCap: 60_000 },
  ],
  baseRate: 0,
  baseCap: 0,
  benefits: [
    {
      id: 'mg-plus-s-simplepay',
      categoryId: 'simplepay',
      rate: 0.1,
      monthlyCap: 60_000,
      minTransactionAmount: 10_000,
      note: '간편결제 10% · 네이버페이·카카오페이·토스페이·SSG페이·11pay·스마일페이 · 건당 1만원 이상',
    },
    {
      id: 'mg-plus-s-subscription',
      categoryId: 'subscription',
      rate: 0.5,
      monthlyCap: 60_000,
      note: '영상 스트리밍·디지털 멤버십 50% · 넷플릭스·유튜브 프리미엄·디즈니+·Wavve·티빙 / 네이버플러스·컬리멤버스·쿠팡와우',
    },
  ],
  active: true,
}

export const DEFAULT_SETTINGS: Settings = {
  monthlyIncome: 3_400_000,
  monthlyBudget: 1_600_000,
  monthlyGoal: 1_500_000,
  categoryBudgets: {
    food: 150_000,
    cafe: 60_000,
    mart: 120_000,
    delivery: 80_000,
    shopping: 150_000,
    simplepay: 100_000,
    transport: 160_000,
    fuel: 70_000,
    telecom: 60_000,
    subscription: 50_000,
    travel: 90_000,
    culture: 65_000,
    medical: 150_000,
    living: 80_000,
    education: 45_000,
    etc: 110_000,
  },
}
