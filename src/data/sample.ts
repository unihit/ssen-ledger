import type { AppState, Card, CategoryId, Transaction } from '../types'
import { currentMonth, daysElapsed, shiftMonth, todayISO } from '../lib/date'
import { createCards, DEFAULT_SETTINGS } from './cards'

interface MerchantSeed {
  name: string
  amount: number
}

const MERCHANTS: Record<CategoryId, MerchantSeed[]> = {
  food: [
    { name: '김밥천국', amount: 8_500 },
    { name: '백반집', amount: 12_000 },
    { name: '이자카야', amount: 34_000 },
    { name: '돈까스', amount: 11_000 },
    { name: '파스타', amount: 21_000 },
    { name: '국밥', amount: 10_000 },
    { name: '샐러드', amount: 9_800 },
    { name: '고깃집', amount: 46_000 },
  ],
  cafe: [
    { name: '스타벅스', amount: 6_500 },
    { name: '메가커피', amount: 2_800 },
    { name: '투썸플레이스', amount: 7_800 },
    { name: '동네 베이커리', amount: 12_000 },
    { name: '빽다방', amount: 3_500 },
  ],
  mart: [
    { name: '이마트', amount: 68_000 },
    { name: '홈플러스', amount: 45_000 },
    { name: 'GS25', amount: 9_800 },
    { name: 'CU 편의점', amount: 4_500 },
    { name: '노브랜드', amount: 23_000 },
  ],
  delivery: [
    { name: '배달의민족', amount: 25_000 },
    { name: '쿠팡이츠', amount: 18_900 },
    { name: '요기요', amount: 15_500 },
    { name: '교촌치킨', amount: 23_000 },
  ],
  shopping: [
    { name: '무신사', amount: 79_000 },
    { name: '쿠팡', amount: 45_900 },
    { name: '올리브영', amount: 23_000 },
    { name: '다이소', amount: 12_000 },
    { name: '유니클로', amount: 59_000 },
    { name: '네이버쇼핑', amount: 36_500 },
  ],
  simplepay: [
    { name: '네이버페이', amount: 32_000 },
    { name: '카카오페이', amount: 18_000 },
    { name: '토스페이', amount: 12_000 },
    { name: 'SSG페이', amount: 24_000 },
  ],
  transport: [
    { name: '지하철', amount: 1_550 },
    { name: '버스', amount: 1_500 },
    { name: '카카오택시', amount: 12_400 },
    { name: 'KTX', amount: 59_800 },
  ],
  fuel: [
    { name: 'GS칼텍스', amount: 60_000 },
    { name: 'SK엔크린', amount: 50_000 },
    { name: '쏘카', amount: 32_000 },
  ],
  telecom: [
    { name: 'SKT 통신요금', amount: 55_000 },
    { name: 'KT 통신요금', amount: 49_000 },
  ],
  subscription: [
    { name: '넷플릭스', amount: 17_000 },
    { name: '유튜브 프리미엄', amount: 14_900 },
    { name: '멜론', amount: 10_900 },
    { name: '쿠팡 와우', amount: 7_890 },
  ],
  travel: [
    { name: '야놀자', amount: 89_000 },
    { name: '대한항공', amount: 320_000 },
    { name: '여기어때', amount: 76_000 },
  ],
  culture: [
    { name: 'CGV', amount: 15_000 },
    { name: '교보문고', amount: 24_000 },
    { name: '헬스장', amount: 45_000 },
    { name: '전시회', amount: 18_000 },
  ],
  medical: [
    { name: '약국', amount: 8_000 },
    { name: '연세내과', amount: 12_000 },
    { name: '치과', amount: 90_000 },
  ],
  living: [
    { name: '쿠팡 생활용품', amount: 23_000 },
    { name: '다이소', amount: 8_000 },
    { name: '크린토피아', amount: 12_000 },
    { name: '이케아', amount: 65_000 },
  ],
  education: [
    { name: '인프런', amount: 33_000 },
    { name: '교재 구입', amount: 18_000 },
  ],
  etc: [
    { name: '경조사비', amount: 50_000 },
    { name: '선물', amount: 35_000 },
    { name: '주차비', amount: 6_000 },
  ],
}

/** 카테고리별 월 발생 건수 (대략치) */
const MONTHLY_COUNTS: Record<CategoryId, number> = {
  food: 7,
  cafe: 9,
  mart: 4,
  delivery: 3,
  shopping: 3,
  simplepay: 2,
  transport: 6,
  fuel: 1,
  telecom: 0,
  subscription: 0,
  travel: 0,
  culture: 2,
  medical: 1,
  living: 2,
  education: 1,
  etc: 1,
}

type CardWeight = [cardId: string | null, weight: number]

const CARD_WEIGHTS: Record<CategoryId, CardWeight[]> = {
  food: [
    ['ssen-light', 35],
    ['ssen-plus', 40],
    ['ssen-check', 10],
    [null, 15],
  ],
  cafe: [
    ['ssen-light', 50],
    ['ssen-check', 30],
    ['ssen-plus', 10],
    [null, 10],
  ],
  mart: [
    ['ssen-plus', 60],
    ['ssen-light', 22],
    ['ssen-check', 5],
    [null, 13],
  ],
  delivery: [
    ['ssen-light', 60],
    ['ssen-plus', 15],
    [null, 25],
  ],
  shopping: [
    ['ssen-plus', 55],
    ['ssen-travel', 15],
    ['ssen-light', 10],
    [null, 20],
  ],
  simplepay: [[null, 100]],
  transport: [
    ['ssen-light', 55],
    ['ssen-check', 35],
    [null, 10],
  ],
  fuel: [
    ['ssen-plus', 70],
    [null, 30],
  ],
  telecom: [
    ['ssen-plus', 60],
    [null, 40],
  ],
  subscription: [
    ['ssen-plus', 40],
    ['ssen-light', 30],
    ['ssen-check', 20],
    [null, 10],
  ],
  travel: [
    ['ssen-travel', 70],
    ['ssen-plus', 15],
    [null, 15],
  ],
  culture: [
    ['ssen-plus', 30],
    ['ssen-light', 20],
    ['ssen-check', 20],
    [null, 30],
  ],
  medical: [
    ['ssen-check', 40],
    ['ssen-light', 20],
    [null, 40],
  ],
  living: [
    ['ssen-plus', 50],
    ['ssen-check', 20],
    [null, 30],
  ],
  education: [
    ['ssen-plus', 30],
    ['ssen-check', 20],
    [null, 50],
  ],
  etc: [
    ['ssen-check', 20],
    ['ssen-plus', 20],
    [null, 60],
  ],
}

function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickWeighted(random: () => number, weights: CardWeight[]): string | null {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0)
  let cursor = random() * total
  for (const [cardId, weight] of weights) {
    cursor -= weight
    if (cursor <= 0) return cardId
  }
  return weights[weights.length - 1][0]
}

function pick<T>(random: () => number, items: T[]): T {
  return items[Math.floor(random() * items.length)]
}

const pad2 = (value: number) => String(value).padStart(2, '0')

function makeTransaction(
  random: () => number,
  month: string,
  day: number,
  categoryId: CategoryId,
  cardId: string | null,
  index: number,
  amountOverride?: number,
): Transaction {
  const seed = pick(random, MERCHANTS[categoryId])
  const variance = 0.85 + random() * 0.3
  const amount = amountOverride ?? Math.round((seed.amount * variance) / 100) * 100
  return {
    id: `tx-${month}-${index}`,
    date: `${month}-${pad2(day)}`,
    merchant: seed.name,
    amount,
    categoryId,
    cardId,
  }
}

function monthlyTransactions(month: string, random: () => number): Transaction[] {
  const transactions: Transaction[] = []
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  const isCurrent = month === currentMonth()
  const limitDay = isCurrent ? daysElapsed(month) : lastDay
  let index = 0

  const push = (day: number, category: CategoryId, amount?: number) => {
    if (day > limitDay) return
    const cardId = pickWeighted(random, CARD_WEIGHTS[category])
    transactions.push(makeTransaction(random, month, day, category, cardId, index, amount))
    index += 1
  }

  // 고정 구독/통신
  push(15, 'telecom')
  push(5, 'subscription')
  push(12, 'subscription')
  push(20, 'subscription')
  push(3, 'subscription')

  for (const [category, count] of Object.entries(MONTHLY_COUNTS) as [CategoryId, number][]) {
    for (let i = 0; i < count; i += 1) {
      const day = 1 + Math.floor(random() * 29)
      push(day, category)
    }
  }

  // 가끔 있는 큰 지출
  if (random() < 0.55) {
    push(8 + Math.floor(random() * 15), 'travel')
  }
  if (random() < 0.35) {
    push(18, 'medical', 120_000)
  }

  // 실적 제외 예시 (보험료)
  if (random() < 0.5) {
    const day = 10 + Math.floor(random() * 10)
    if (day <= limitDay) {
      transactions.push({
        id: `tx-${month}-excluded`,
        date: `${month}-${pad2(day)}`,
        merchant: '현대해상 자동차보험',
        amount: 98_000,
        categoryId: 'etc',
        cardId: 'ssen-plus',
        excluded: true,
        memo: '실적 제외 항목 예시',
      })
    }
  }

  // 여행 카드도 매달 최소 한 번은 쓰이도록 보정
  if (!transactions.some((transaction) => transaction.cardId === 'ssen-travel')) {
    const candidate = transactions.find(
      (transaction) => transaction.categoryId === 'shopping',
    )
    if (candidate) candidate.cardId = 'ssen-travel'
  }

  return transactions
}

export function createSampleTransactions(): Transaction[] {
  const month = currentMonth()
  const transactions: Transaction[] = []
  for (let offset = 5; offset >= 0; offset -= 1) {
    const target = shiftMonth(month, -offset)
    const seed = Number(target.replace('-', '')) + 17
    transactions.push(...monthlyTransactions(target, mulberry32(seed)))
  }
  return transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export function createInitialState(): AppState {
  const cards: Card[] = createCards()
  return {
    version: 1,
    cards,
    transactions: createSampleTransactions(),
    settings: { ...DEFAULT_SETTINGS, categoryBudgets: { ...DEFAULT_SETTINGS.categoryBudgets } },
  }
}

export function isTodayInMonth(month: string): boolean {
  return todayISO().startsWith(month)
}
