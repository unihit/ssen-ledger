import type { AppState } from '../types'
import { createCards, DEFAULT_SETTINGS } from './cards'

/**
 * 빈 가계부 초기 상태.
 * 실제 보유 카드만 넣고, 결제 내역은 비워 둡니다.
 */
export function createInitialState(): AppState {
  return {
    version: 1,
    cards: createCards(),
    transactions: [],
    settings: {
      ...DEFAULT_SETTINGS,
      categoryBudgets: { ...DEFAULT_SETTINGS.categoryBudgets },
    },
  }
}
