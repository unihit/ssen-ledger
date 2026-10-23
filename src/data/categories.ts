import type { Category, CategoryId } from '../types'

export const CATEGORIES: Category[] = [
  { id: 'food', label: '식비', emoji: '🍚', color: '#ff8a3d' },
  { id: 'cafe', label: '카페·간식', emoji: '☕', color: '#b07cf0' },
  { id: 'mart', label: '마트·편의점', emoji: '🛒', color: '#4e9aff' },
  { id: 'delivery', label: '배달', emoji: '🛵', color: '#ff6b6b' },
  { id: 'shopping', label: '쇼핑', emoji: '🛍️', color: '#ff5c8a' },
  { id: 'simplepay', label: '간편결제', emoji: '💳', color: '#14b8a6' },
  { id: 'transport', label: '대중교통', emoji: '🚇', color: '#36c98f' },
  { id: 'fuel', label: '주유·차량', emoji: '⛽', color: '#f4b740' },
  { id: 'telecom', label: '통신', emoji: '📱', color: '#8a94a6' },
  { id: 'subscription', label: '구독', emoji: '🎬', color: '#7c6cf5' },
  { id: 'travel', label: '여행·숙박', emoji: '✈️', color: '#2ec4b6' },
  { id: 'culture', label: '문화·여가', emoji: '🎨', color: '#5b8def' },
  { id: 'medical', label: '의료·건강', emoji: '💊', color: '#f06a8a' },
  { id: 'living', label: '생활·생필품', emoji: '🧺', color: '#f2a93b' },
  { id: 'education', label: '교육', emoji: '📚', color: '#6b7cff' },
  { id: 'savings', label: '저축', emoji: '🏦', color: '#2f9e79' },
  { id: 'etc', label: '기타', emoji: '📦', color: '#adb5bd' },
]

/** 지출·카드 혜택 대상 카테고리. 저축은 별도로 집계합니다. */
export const SPENDING_CATEGORIES = CATEGORIES.filter(
  (category) => category.id !== 'savings',
)

export function isSavingsCategory(
  categoryId: CategoryId | string | null | undefined,
): boolean {
  return categoryId === 'savings'
}

export const CATEGORY_MAP: Record<CategoryId, Category> = CATEGORIES.reduce(
  (acc, category) => {
    acc[category.id] = category
    return acc
  },
  {} as Record<CategoryId, Category>,
)

export function categoryOf(id: CategoryId): Category {
  return CATEGORY_MAP[id] ?? CATEGORY_MAP.etc
}
