export const CARD_PAYMENT_METHODS = ['신용카드', '체크카드', '간편결제'] as const
export const CASH_PAYMENT_METHODS = ['계좌이체', '현금', '자동이체', '기타'] as const

export const PAYMENT_METHODS = [
  '신용카드',
  '체크카드',
  '간편결제',
  '계좌이체',
  '현금',
  '자동이체',
  '기타',
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_EMOJI: Record<string, string> = {
  신용카드: '💳',
  체크카드: '💳',
  간편결제: '⚡',
  계좌이체: '🏦',
  현금: '💵',
  자동이체: '🔁',
  기타: '📝',
}

/** 선택한 카드(또는 현금·계좌)에서 고를 수 있는 결제수단 목록 */
export function paymentMethodOptions(
  card?: { kind: 'credit' | 'check' } | null,
  current?: string,
): string[] {
  const base = card
    ? [card.kind === 'check' ? '체크카드' : '신용카드', '간편결제']
    : ['계좌이체', '현금', '자동이체']
  // 기존 내역이 다른 값(예: 기타)이면 편집 시 유지할 수 있게 포함
  if (current && !base.includes(current) && !card) base.push(current)
  return base
}

/** 선택한 카드(또는 현금·계좌)에서 고를 수 있는 결제수단인지 */
export function isPaymentMethodAllowed(
  method: string,
  card?: { kind: 'credit' | 'check' } | null,
): boolean {
  if (!card) return (CASH_PAYMENT_METHODS as readonly string[]).includes(method)
  if (method === '간편결제') return true
  return method === (card.kind === 'check' ? '체크카드' : '신용카드')
}

/** 카드의 종류(신용/체크)에 맞는 기본 결제수단 반환 */
export function defaultPaymentMethodForCard(kind?: 'credit' | 'check' | null): string {
  if (!kind) return '계좌이체'
  return kind === 'check' ? '체크카드' : '신용카드'
}
