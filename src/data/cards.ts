import type { Card, Settings } from '../types'

/**
 * MG+ S 하나카드 실제 약관 기반 예시.
 * 2025-10-18 신규 신청 중단. 기존 카드 보유자 약관 기준으로 입력했습니다.
 * 간편결제 혜택은 결제수단이 '간편결제'이거나 카테고리가 '간편결제'이면 계산됩니다.
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
      paymentMethods: ['간편결제'],
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

/**
 * 신한 나라사랑체크카드 (2026-01-05 출시 상품 기준).
 * - 전월실적 구간별 Life 통합 캐시백 한도:
 *   10만 이상~20만 미만: 5,000원
 *   20만 이상~50만 미만: 20,000원
 *   50만 이상~70만 미만: 30,000원
 *   70만 이상~100만 미만: 40,000원
 *   100만 이상: 50,000원
 * - PX/군마트·CGV·놀이공원 등은 별도 제공
 */
export const SHINHAN_NARA_CARD: Card = {
  id: 'shinhan-nara-check',
  name: '신한 나라사랑체크카드',
  issuer: '신한카드',
  kind: 'check',
  colorFrom: '#0046ff',
  colorTo: '#00227a',
  minSpendForBenefits: 100_000,
  monthlyTotalCap: 5_000,
  performanceTiers: [
    { minSpend: 100_000, monthlyTotalCap: 5_000 },
    { minSpend: 200_000, monthlyTotalCap: 20_000 },
    { minSpend: 500_000, monthlyTotalCap: 30_000 },
    { minSpend: 700_000, monthlyTotalCap: 40_000 },
    { minSpend: 1_000_000, monthlyTotalCap: 50_000 },
  ],
  baseRate: 0,
  baseCap: 0,
  active: true,
  benefits: [
    {
      id: 'shinhan-nara-transport',
      categoryId: 'transport',
      rate: 0.2,
      monthlyCap: 5_000,
      note: '시내버스·지하철 후불교통 20% 캐시백 (월 5,000원 한도) · KTX/고속버스 10% · 카카오T 10%',
    },
    {
      id: 'shinhan-nara-mart',
      categoryId: 'mart',
      rate: 0.2,
      monthlyCap: 5_000,
      note: 'GS25·CU 20% 캐시백 (일 1회, 월 5회, 건당 최대 1,000원) · CU 행사상품 10% 현장할인',
    },
    {
      id: 'shinhan-nara-cafe',
      categoryId: 'cafe',
      rate: 0.05,
      monthlyCap: 6_000,
      note: '스타벅스·이디야·메가MGC·컴포즈·빽다방 5% 캐시백 (일 1회, 월 3회, 건당 최대 2,000원)',
    },
    {
      id: 'shinhan-nara-delivery',
      categoryId: 'delivery',
      rate: 0.05,
      monthlyCap: 5_000,
      note: '배달의민족 앱 결제 5% 캐시백 (일 1회, 월 5회, 건당 최대 1,000원)',
    },
    {
      id: 'shinhan-nara-telecom',
      categoryId: 'telecom',
      rate: 0.05,
      monthlyCap: 5_000,
      note: '통신요금 자동이체 5% 캐시백 (SKT·KT·LGU+ 및 알뜰폰허브, 월 1회, 건당 최대 5,000원)',
    },
    {
      id: 'shinhan-nara-subscription',
      categoryId: 'subscription',
      rate: 0.1,
      monthlyCap: 5_000,
      note: 'OTT 10% 캐시백 (유튜브 프리미엄·넷플릭스·티빙 공식 홈페이지 결제)',
    },
    {
      id: 'shinhan-nara-shopping',
      categoryId: 'shopping',
      rate: 0.1,
      monthlyCap: 6_000,
      note: '무신사·29CM 공식 앱/웹 결제 10% 캐시백 (월 6,000원 한도)',
    },
    {
      id: 'shinhan-nara-culture',
      categoryId: 'culture',
      rate: 0.2,
      monthlyCap: 6_000,
      note: 'CGV 2D 티켓 6,000원 구매 (월 1회 2매) · 알라딘/YES24 5% · 에버랜드/롯데월드 50% (30만원 이상, 연 3회)',
    },
    {
      id: 'shinhan-nara-living',
      categoryId: 'living',
      rate: 0.2,
      monthlyCap: 100_000,
      note: '군 PX 및 GS25 해군마트 20% 캐시백 (3만원 미만 일 1,000원, 3만원 이상 20%, 매월 10일 50%, 전월실적 무관)',
    },
  ],
}

/**
 * KB국민 직장인보너스체크카드.
 * - 전월실적 구간별 월 통합할인한도:
 *   20만 이상~30만 미만: 5,000원
 *   30만 이상~50만 미만: 10,000원
 *   50만 이상~100만 미만: 20,000원
 *   100만 이상: 50,000원
 * - 주유, 국세/지방세 및 보험료 환급, 아웃백, 백화점, 대중교통 등 직장인 특화
 */
export const KB_BONUS_CARD: Card = {
  id: 'kb-bonus-check',
  name: 'KB국민 직장인보너스체크카드',
  issuer: 'KB국민카드',
  kind: 'check',
  colorFrom: '#f59e0b',
  colorTo: '#1e293b',
  minSpendForBenefits: 200_000,
  monthlyTotalCap: 5_000,
  performanceTiers: [
    { minSpend: 200_000, monthlyTotalCap: 5_000 },
    { minSpend: 300_000, monthlyTotalCap: 10_000 },
    { minSpend: 500_000, monthlyTotalCap: 20_000 },
    { minSpend: 1_000_000, monthlyTotalCap: 50_000 },
  ],
  baseRate: 0,
  baseCap: 0,
  active: true,
  benefits: [
    {
      id: 'kb-bonus-fuel',
      categoryId: 'fuel',
      rate: 0.035,
      monthlyCap: 10_000,
      minSpend: 200_000,
      note: 'GS칼텍스 주중 50원/L, 주말 60원/L 환급할인 (건당 10만원, 월 30만원 이용금액 한도)',
    },
    {
      id: 'kb-bonus-transport',
      categoryId: 'transport',
      rate: 0.05,
      monthlyCap: 1_000,
      minSpend: 300_000,
      note: '대중교통(버스/지하철) 5% 청구할인 (월 이용금액 2만원 한도, 월 최대 1,000원)',
    },
    {
      id: 'kb-bonus-food',
      categoryId: 'food',
      rate: 0.1,
      monthlyCap: 10_000,
      minSpend: 200_000,
      minTransactionAmount: 30_000,
      note: '아웃백 10% 환급할인 (건당 3만~10만원 결제 시, 건당 최대 10,000원)',
    },
    {
      id: 'kb-bonus-shopping',
      categoryId: 'shopping',
      rate: 0.05,
      monthlyCap: 10_000,
      minSpend: 500_000,
      minTransactionAmount: 50_000,
      note: '롯데·현대·신세계백화점 5% 환급할인 (건당 5만~10만원 결제 시, 건당 최대 5,000원)',
    },
    {
      id: 'kb-bonus-telecom',
      categoryId: 'telecom',
      rate: 0.02,
      monthlyCap: 1_000,
      minSpend: 300_000,
      minTransactionAmount: 50_000,
      note: '이동통신요금 자동이체 건당 5만원 이상 시 1,000원 환급 (월 1회)',
    },
    {
      id: 'kb-bonus-tax-insurance',
      categoryId: 'insurance',
      rate: 0.07,
      monthlyCap: 9_000,
      minSpend: 300_000,
      minTransactionAmount: 100_000,
      note: '국세·지방세 7,000원 환급(건당 10만원 이상, 월 1회) · 보험료 2,000원 환급(건당 10만원 이상, 월 1회)',
    },
    {
      id: 'kb-bonus-culture',
      categoryId: 'culture',
      rate: 0.5,
      monthlyCap: 25_000,
      minSpend: 200_000,
      minTransactionAmount: 30_000,
      note: '에버랜드 현장 티켓 발매 50% 환급할인 (건당 3만~5만원 결제 시, 건당 최대 25,000원)',
    },
  ],
}

/**
 * 실제 보유 카드 목록.
 *
 * 혜택은 2026-10 기준 공개된 상품 안내를 바탕으로 앱의 카테고리/한도 모델에
 * 맞게 근사한 값입니다. 가맹점별 고정 할인은 note에 실제 조건을 적었고,
 * 카드사 사정으로 조건이 달라질 수 있습니다. 카드 화면에서 직접 수정할 수 있습니다.
 */
const MY_CARDS: Card[] = [
  MG_PLUS_S_CARD,
  SHINHAN_NARA_CARD,
  KB_BONUS_CARD,
  {
    id: 'kb-nara-check',
    name: 'KB국민 나라사랑체크카드',
    issuer: 'KB국민카드 · 발급 종료',
    kind: 'check',
    colorFrom: '#e11d48',
    colorTo: '#1e3a8a',
    minSpendForBenefits: 100_000,
    monthlyTotalCap: 5_000,
    performanceTiers: [
      { minSpend: 100_000, monthlyTotalCap: 5_000 },
      { minSpend: 200_000, monthlyTotalCap: 10_000 },
      { minSpend: 300_000, monthlyTotalCap: 20_000 },
      { minSpend: 500_000, monthlyTotalCap: 30_000 },
      { minSpend: 1_000_000, monthlyTotalCap: 50_000 },
    ],
    baseRate: 0,
    baseCap: 0,
    active: true,
    benefits: [
      {
        id: 'kb-nara-transport',
        categoryId: 'transport',
        rate: 0.2,
        monthlyCap: 20_000,
        note: '대중교통 20% 청구할인',
      },
      {
        id: 'kb-nara-cafe',
        categoryId: 'cafe',
        rate: 0.2,
        monthlyCap: 20_000,
        note: '스타벅스 20% 환급할인',
      },
      {
        id: 'kb-nara-culture',
        categoryId: 'culture',
        rate: 0.35,
        monthlyCap: 20_000,
        note: 'CGV 35% · 놀이공원 50% (통합한도)',
      },
      {
        id: 'kb-nara-shopping',
        categoryId: 'shopping',
        rate: 0.05,
        monthlyCap: 20_000,
        note: 'GS홈쇼핑·CJ홈쇼핑·G마켓·옥션 5%',
      },
      {
        id: 'kb-nara-food',
        categoryId: 'food',
        rate: 0.2,
        monthlyCap: 20_000,
        note: '아웃백·VIPS 20%',
      },
      {
        id: 'kb-nara-telecom',
        categoryId: 'telecom',
        rate: 0.05,
        monthlyCap: 2_500,
        minTransactionAmount: 50_000,
        note: '통신요금 자동납부 건당 5만원 이상 2,500원',
      },
    ],
  },
  {
    id: 'kb-toktok-my-point',
    name: 'KB국민 톡톡 my point 카드',
    issuer: 'KB국민카드',
    kind: 'credit',
    colorFrom: '#8b5cf6',
    colorTo: '#4c1d95',
    minSpendForBenefits: 0,
    monthlyTotalCap: 11_000,
    baseRate: 0.055,
    baseCap: 11_000,
    active: true,
    benefits: [
      {
        id: 'kb-toktok-kbpay',
        categoryId: 'simplepay',
        rate: 0.055,
        monthlyCap: 11_000,
        note: '5.5% · 월 20만원 결제까지(최대 11,000원) · 연 KB Pay 300만원 이상 12,000점 별도',
      },
    ],
  },
  {
    id: 'mg-honey-check',
    name: '꿀카드',
    issuer: 'MG새마을금고',
    kind: 'check',
    colorFrom: '#f59e0b',
    colorTo: '#b45309',
    minSpendForBenefits: 100_000,
    monthlyTotalCap: 20_000,
    baseRate: 0,
    baseCap: 0,
    active: true,
    benefits: [
      {
        id: 'mg-honey-coupang',
        categoryId: 'shopping',
        rate: 0.1,
        monthlyCap: 2_900,
        minSpend: 100_000,
        note: '쿠팡 로켓와우 자동납부 최대 2,900원',
      },
      {
        id: 'mg-honey-ott',
        categoryId: 'subscription',
        rate: 0.1,
        monthlyCap: 2_000,
        minSpend: 200_000,
        minTransactionAmount: 10_000,
        note: 'OTT 자동납부 2,000원 · 음원 1,000원',
      },
      {
        id: 'mg-honey-untact',
        categoryId: 'simplepay',
        rate: 0.1,
        monthlyCap: 10_000,
        minSpend: 300_000,
        minTransactionAmount: 10_000,
        note: '간편결제·쇼핑·배달 1,000원 × 월 10회',
      },
    ],
  },
  {
    id: 'woori-skt',
    name: 'SKT 우리카드',
    issuer: '우리카드 · SKT (발급 종료)',
    kind: 'credit',
    colorFrom: '#2563eb',
    colorTo: '#dc2626',
    minSpendForBenefits: 300_000,
    monthlyTotalCap: 10_000,
    performanceTiers: [
      { minSpend: 300_000, monthlyTotalCap: 10_000 },
      { minSpend: 700_000, monthlyTotalCap: 15_000 },
      { minSpend: 1_000_000, monthlyTotalCap: 20_000 },
    ],
    baseRate: 0,
    baseCap: 0,
    active: true,
    benefits: [
      {
        id: 'woori-skt-telecom',
        categoryId: 'telecom',
        rate: 0.36,
        monthlyCap: 20_000,
        minSpend: 300_000,
        note: 'SKT 통신요금 자동납부 10,000/15,000/20,000원 (T라이트 +1,000~3,000)',
      },
      {
        id: 'woori-skt-culture',
        categoryId: 'culture',
        rate: 0.2,
        monthlyCap: 3_000,
        minSpend: 300_000,
        minTransactionAmount: 12_000,
        note: '영화 3,000원 청구할인',
      },
      {
        id: 'woori-skt-food',
        categoryId: 'food',
        rate: 0.1,
        monthlyCap: 20_000,
        minSpend: 300_000,
        note: 'VIPS·생어거스틴 10% (월 2회, 건당 1만원 한도)',
      },
      {
        id: 'woori-skt-cafe',
        categoryId: 'cafe',
        rate: 0.2,
        monthlyCap: 10_000,
        minSpend: 300_000,
        note: '할리스·엔제리너스 20% (월 2회, 건당 5천원 한도)',
      },
    ],
  },
]

export function createCards(): Card[] {
  return MY_CARDS.map((card) => ({
    ...card,
    benefits: card.benefits.map((rule) => ({ ...rule })),
    performanceTiers: card.performanceTiers?.map((tier) => ({ ...tier })) ?? [],
  }))
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
    game: 50_000,
    medical: 150_000,
    insurance: 60_000,
    living: 80_000,
    education: 45_000,
    etc: 110_000,
  },
}
