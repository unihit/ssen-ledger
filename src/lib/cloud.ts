import { DEFAULT_SETTINGS } from '../data/cards'
import type {
  AppState,
  BenefitRule,
  Card,
  CardKind,
  FixedExpense,
  FixedExpenseApplication,
  PerformanceTier,
  Settings,
  Transaction,
} from '../types'
import { appCategoryForSheet } from './fixedExpenses'
import { requireSupabase } from './supabase'

interface CardRow {
  id: string
  name: string
  issuer: string
  kind: CardKind
  color_from: string
  color_to: string
  min_spend_for_benefits: number
  monthly_total_cap: number
  base_rate: number | string
  base_cap: number
  benefits: unknown
  performance_tiers: unknown
  active: boolean
}

interface TransactionRow {
  id: string
  date: string
  merchant: string
  amount: number
  category_id: Transaction['categoryId']
  card_id: string | null
  memo: string | null
  excluded: boolean | null
  category_major?: string | null
  category_minor?: string | null
  category_group?: string | null
  correction?: number | null
  effective_amount?: number | null
  payment_method?: string | null
  note?: string | null
  status?: 'active' | 'canceled' | null
  source?: string | null
  fixed_expense_id?: string | null
  fixed_expense_month?: string | null
}

interface FixedExpenseRow {
  id: string
  active: boolean
  start_month: string | null
  end_month: string | null
  day_of_month: number
  category_major: string
  category_minor: string
  category_group: string
  category_id: string | null
  amount: number
  merchant: string | null
  memo: string | null
  payment_method: string | null
  note: string | null
  card_id: string | null
}

export interface CloudSnapshot {
  state: AppState
  hasAnyTransaction: boolean
  fixedExpenses: FixedExpense[]
  fixedExpenseApplications: FixedExpenseApplication[]
}

function sheetMinorFor(categoryId: Transaction['categoryId']): string {
  switch (categoryId) {
    case 'food':
      return '외식비'
    case 'cafe':
      return '카페'
    case 'mart':
      return '마트'
    case 'delivery':
      return '외식비'
    case 'shopping':
      return '의복/미용'
    case 'simplepay':
      return '기타'
    case 'transport':
      return '교통'
    case 'fuel':
      return '자동차'
    case 'telecom':
      return '통신'
    case 'subscription':
      return '구독'
    case 'travel':
      return '기타'
    case 'culture':
      return '게임'
    case 'medical':
      return '건강'
    case 'living':
      return '생활'
    case 'education':
      return '기타'
    case 'etc':
    default:
      return '기타'
  }
}

function paymentMethodFor(transaction: Transaction): string {
  if (transaction.paymentMethod) return transaction.paymentMethod
  return transaction.cardId ? '신용카드' : '현금'
}

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    kind: row.kind === 'check' ? 'check' : 'credit',
    colorFrom: row.color_from,
    colorTo: row.color_to,
    minSpendForBenefits: Number(row.min_spend_for_benefits) || 0,
    monthlyTotalCap: Number(row.monthly_total_cap) || 0,
    baseRate: Number(row.base_rate) || 0,
    baseCap: Number(row.base_cap) || 0,
    benefits: Array.isArray(row.benefits) ? (row.benefits as BenefitRule[]) : [],
    performanceTiers: Array.isArray(row.performance_tiers)
      ? (row.performance_tiers as PerformanceTier[])
      : [],
    active: Boolean(row.active),
  }
}

function fromCard(householdId: string, card: Card) {
  return {
    household_id: householdId,
    id: card.id,
    name: card.name,
    issuer: card.issuer,
    kind: card.kind,
    color_from: card.colorFrom,
    color_to: card.colorTo,
    min_spend_for_benefits: card.minSpendForBenefits,
    monthly_total_cap: card.monthlyTotalCap,
    base_rate: card.baseRate,
    base_cap: card.baseCap,
    benefits: card.benefits,
    performance_tiers: card.performanceTiers ?? [],
    active: card.active,
  }
}

function toFixedExpense(row: FixedExpenseRow): FixedExpense {
  return {
    id: row.id,
    name: row.merchant ?? '',
    amount: Number(row.amount) || 0,
    categoryId:
      (row.category_id as FixedExpense['categoryId'] | null) ??
      appCategoryForSheet(row.category_major, row.category_minor),
    categoryMajor: row.category_major,
    categoryMinor: row.category_minor,
    categoryGroup: row.category_group,
    cardId: row.card_id,
    paymentMethod: row.payment_method ?? undefined,
    dayOfMonth: Number(row.day_of_month) || 1,
    startMonth: row.start_month
      ? String(row.start_month).slice(0, 7)
      : undefined,
    endMonth: row.end_month ? String(row.end_month).slice(0, 7) : undefined,
    memo: row.memo ?? undefined,
    note: row.note ?? undefined,
    active: Boolean(row.active),
  }
}

function fromFixedExpense(householdId: string, fixedExpense: FixedExpense) {
  return {
    household_id: householdId,
    id: fixedExpense.id,
    active: fixedExpense.active,
    start_month: fixedExpense.startMonth
      ? `${fixedExpense.startMonth}-01`
      : null,
    end_month: fixedExpense.endMonth ? `${fixedExpense.endMonth}-01` : null,
    day_of_month: fixedExpense.dayOfMonth,
    category_major: fixedExpense.categoryMajor,
    category_minor: fixedExpense.categoryMinor,
    category_group: fixedExpense.categoryGroup,
    category_id: fixedExpense.categoryId,
    amount: fixedExpense.amount,
    merchant: fixedExpense.name,
    memo: fixedExpense.memo ?? null,
    payment_method: fixedExpense.paymentMethod ?? null,
    note: fixedExpense.note ?? null,
    card_id: fixedExpense.cardId,
    updated_by: 'app',
  }
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    date: row.date,
    merchant: row.merchant,
    amount: Number(row.amount) || 0,
    categoryId: row.category_id,
    cardId: row.card_id,
    memo: row.memo ?? undefined,
    excluded: Boolean(row.excluded),
    categoryMajor: row.category_major ?? undefined,
    categoryMinor: row.category_minor ?? undefined,
    categoryGroup: row.category_group ?? undefined,
    correction: Number(row.correction) || 0,
    effectiveAmount: Number(row.effective_amount) || Number(row.amount) || 0,
    paymentMethod: row.payment_method ?? undefined,
    note: row.note ?? undefined,
    status: row.status ?? 'active',
    source: row.source ?? undefined,
    fixedExpenseId: row.fixed_expense_id ?? undefined,
    fixedExpenseMonth: row.fixed_expense_month
      ? String(row.fixed_expense_month).slice(0, 7)
      : undefined,
  }
}

function fromTransaction(householdId: string, transaction: Transaction) {
  return {
    household_id: householdId,
    id: transaction.id,
    date: transaction.date,
    merchant: transaction.merchant,
    amount: transaction.amount,
    category_id: transaction.categoryId,
    card_id: transaction.cardId,
    memo: transaction.memo ?? null,
    excluded: transaction.excluded ?? false,
    category_major: transaction.categoryMajor ?? '생활비',
    category_minor:
      transaction.categoryMinor ?? sheetMinorFor(transaction.categoryId),
    category_group: transaction.categoryGroup ?? '생활비',
    correction: transaction.correction ?? 0,
    payment_method: paymentMethodFor(transaction),
    note: transaction.note ?? null,
    status: transaction.status ?? 'active',
    source: 'app',
    updated_by: 'app',
    fixed_expense_id: transaction.fixedExpenseId ?? null,
    fixed_expense_month: transaction.fixedExpenseMonth
      ? `${transaction.fixedExpenseMonth}-01`
      : null,
  }
}

async function loadAllTransactions(householdId: string): Promise<TransactionRow[]> {
  const supabase = requireSupabase()
  const pageSize = 500
  const rows: TransactionRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('household_id', householdId)
      .order('date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error

    const page = (data ?? []) as TransactionRow[]
    rows.push(...page)

    if (page.length === 0) break
    from += page.length
  }

  return rows
}

export async function loadCloudState(
  householdId: string,
): Promise<CloudSnapshot> {
  const supabase = requireSupabase()

  const [cardsResult, householdResult, transactions, fixedExpenseResult] =
    await Promise.all([
      supabase.from('cards').select('*').eq('household_id', householdId),
      supabase
        .from('households')
        .select('settings')
        .eq('id', householdId)
        .single(),
      loadAllTransactions(householdId),
      supabase
        .from('recurring_expenses')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at', { ascending: true }),
    ])

  if (cardsResult.error) throw cardsResult.error
  if (householdResult.error) throw householdResult.error
  if (fixedExpenseResult.error) throw fixedExpenseResult.error

  const storedSettings =
    householdResult.data?.settings && typeof householdResult.data.settings === 'object'
      ? (householdResult.data.settings as Partial<Settings>)
      : {}

  const visibleTransactions = transactions.filter(
    (row) =>
      (row.status ?? 'active') === 'active' &&
      (row.category_major ?? '생활비') === '생활비',
  )

  const applicationMap = new Map<string, FixedExpenseApplication>()
  for (const row of transactions) {
    if ((row.status ?? 'active') !== 'active' || !row.fixed_expense_id) continue
    const month = row.fixed_expense_month
      ? String(row.fixed_expense_month).slice(0, 7)
      : row.date.slice(0, 7)
    const key = `${row.fixed_expense_id}:${month}`
    if (applicationMap.has(key)) continue
    applicationMap.set(key, {
      fixedExpenseId: row.fixed_expense_id,
      month,
      transactionId: row.id,
      date: row.date,
      amount: Number(row.amount) || 0,
    })
  }

  return {
    state: {
      version: 1,
      cards: ((cardsResult.data ?? []) as CardRow[]).map(toCard),
      transactions: visibleTransactions.map(toTransaction),
      settings: { ...DEFAULT_SETTINGS, ...storedSettings },
    },
    hasAnyTransaction: transactions.length > 0,
    fixedExpenses: ((fixedExpenseResult.data ?? []) as FixedExpenseRow[]).map(
      toFixedExpense,
    ),
    fixedExpenseApplications: [...applicationMap.values()],
  }
}

export async function getHouseholdInitialized(householdId: string): Promise<boolean> {
  const { data, error } = await requireSupabase()
    .from('households')
    .select('initialized')
    .eq('id', householdId)
    .single()

  if (error) throw error
  return Boolean(data?.initialized)
}

export async function markHouseholdInitialized(householdId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('households')
    .update({ initialized: true })
    .eq('id', householdId)

  if (error) throw error
}

export async function saveTransactionRemote(
  householdId: string,
  transaction: Transaction,
): Promise<void> {
  const { error } = await requireSupabase()
    .from('transactions')
    .upsert(fromTransaction(householdId, transaction), {
      onConflict: 'household_id,id',
    })

  if (error) throw error
}

export async function deleteTransactionRemote(
  householdId: string,
  id: string,
): Promise<void> {
  const { error } = await requireSupabase()
    .from('transactions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      cancel_reason: '앱에서 취소',
      source: 'app',
      updated_by: 'app',
    })
    .eq('household_id', householdId)
    .eq('id', id)

  if (error) throw error
}

export async function saveCardRemote(
  householdId: string,
  card: Card,
): Promise<void> {
  const { error } = await requireSupabase()
    .from('cards')
    .upsert(fromCard(householdId, card), {
      onConflict: 'household_id,id',
    })

  if (error) {
    if (
      error.code === '42703' &&
      error.message.includes('performance_tiers')
    ) {
      throw new Error(
        'Supabase에 카드 구간 컬럼이 없어요. supabase/schema.sql을 다시 실행해 주세요.',
      )
    }
    throw error
  }
}

export async function deleteCardRemote(
  householdId: string,
  id: string,
): Promise<void> {
  const { error } = await requireSupabase()
    .from('cards')
    .delete()
    .eq('household_id', householdId)
    .eq('id', id)

  if (error) throw error
}

export async function saveFixedExpenseRemote(
  householdId: string,
  fixedExpense: FixedExpense,
): Promise<void> {
  const { error } = await requireSupabase()
    .from('recurring_expenses')
    .upsert(fromFixedExpense(householdId, fixedExpense), {
      onConflict: 'id',
    })

  if (error) throw error
}

export async function deactivateFixedExpenseRemote(
  householdId: string,
  id: string,
): Promise<void> {
  const { error } = await requireSupabase()
    .from('recurring_expenses')
    .update({
      active: false,
      updated_by: 'app',
    })
    .eq('household_id', householdId)
    .eq('id', id)

  if (error) throw error
}

export async function saveSettingsRemote(
  householdId: string,
  settings: Settings,
): Promise<void> {
  const { error } = await requireSupabase()
    .from('households')
    .update({ settings })
    .eq('id', householdId)

  if (error) throw error
}

export async function clearCloudTransactions(householdId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('transactions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      cancel_reason: '생활비 전체 비우기',
      source: 'app',
      updated_by: 'app',
    })
    .eq('household_id', householdId)
    .eq('status', 'active')
    .eq('category_major', '생활비')

  if (error) throw error
}

export async function replaceCloudState(
  householdId: string,
  state: AppState,
): Promise<void> {
  const cardIds = new Set(state.cards.map((card) => card.id))

  const cards = state.cards.map((card) => fromCard(householdId, card))
  const transactions = state.transactions.map((transaction) =>
    fromTransaction(householdId, {
      ...transaction,
      cardId:
        transaction.cardId && cardIds.has(transaction.cardId)
          ? transaction.cardId
          : null,
    }),
  )

  const { error } = await requireSupabase().rpc('replace_household_state', {
    p_household_id: householdId,
    p_cards: cards,
    p_transactions: transactions,
    p_settings: state.settings,
  })

  if (error) throw error
}
