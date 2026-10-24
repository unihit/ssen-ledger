import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Icon } from './components/Icon'
import { DEFAULT_SETTINGS } from './data/cards'
import {
  DEFAULT_FIXED_EXPENSES,
  DEFAULT_PREV_MONTH_TRANSACTIONS,
  createInitialState,
} from './data/sample'
import { currentMonth } from './lib/date'
import { isSavingsCategory } from './data/categories'
import { SAVINGS_SHEET, withSavingsDefaults } from './lib/savings'
import { useAuth } from './lib/auth'
import {
  clearCloudTransactions,
  deactivateFixedExpenseRemote,
  deleteCardRemote,
  deleteTransactionRemote,
  getHouseholdInitialized,
  loadCloudState,
  markHouseholdInitialized,
  replaceCloudState,
  saveCardRemote,
  saveFixedExpenseRemote,
  saveSettingsRemote,
  saveTransactionRemote,
} from './lib/cloud'
import { supabase } from './lib/supabase'
import type {
  AppState,
  Card,
  CategoryId,
  FixedExpense,
  FixedExpenseApplication,
  Settings,
  Transaction,
} from './types'

const STORAGE_KEY = 'ssen-ledger-state-v2'
const FIXED_EXPENSE_STORAGE_KEY = 'ssen-ledger-fixed-expenses-v1'

/** 예전 샘플 데이터에만 쓰던 카드 ID. 로컬 저장소에 남아 있으면 걷어냅니다. */
const RETIRED_CARD_IDS = new Set([
  'ssen-light',
  'ssen-plus',
  'ssen-travel',
  'ssen-check',
])

export type SyncState = 'local' | 'syncing' | 'synced' | 'error'

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface LocalFixedExpenseData {
  fixedExpenses: FixedExpense[]
  fixedExpenseApplications: FixedExpenseApplication[]
}

function fixedExpenseStorageKey(householdId: string | null): string {
  return householdId
    ? `${FIXED_EXPENSE_STORAGE_KEY}:${householdId}`
    : FIXED_EXPENSE_STORAGE_KEY
}

function loadFixedExpenseData(
  householdId: string | null,
): LocalFixedExpenseData {
  try {
    const raw = localStorage.getItem(fixedExpenseStorageKey(householdId))
    if (!raw) {
      return {
        fixedExpenses: DEFAULT_FIXED_EXPENSES,
        fixedExpenseApplications: [],
      }
    }
    const parsed = JSON.parse(raw) as Partial<LocalFixedExpenseData>
    const fixedExpenses =
      Array.isArray(parsed.fixedExpenses) && parsed.fixedExpenses.length > 0
        ? parsed.fixedExpenses
        : DEFAULT_FIXED_EXPENSES
    return {
      fixedExpenses,
      fixedExpenseApplications: Array.isArray(parsed.fixedExpenseApplications)
        ? parsed.fixedExpenseApplications
        : [],
    }
  } catch {
    return {
      fixedExpenses: DEFAULT_FIXED_EXPENSES,
      fixedExpenseApplications: [],
    }
  }
}

function normalize(state: AppState): AppState {
  const cards = Array.isArray(state.cards)
    ? state.cards.filter((card) => !RETIRED_CARD_IDS.has(card.id))
    : createInitialState().cards
  const existingTransactions = Array.isArray(state.transactions)
    ? state.transactions
        .filter(
          (transaction) =>
            !transaction.cardId || !RETIRED_CARD_IDS.has(transaction.cardId),
        )
        .filter((transaction) => transaction.id !== 'sample-prev-kb-nara')
        .map((transaction) =>
          transaction.id === 'sample-prev-mg-plus-s'
            ? {
                ...transaction,
                amount: 1000000,
                memo: '9월 실적 충족 (100만 구간 · 통합한도 6만)',
              }
            : transaction,
        )
    : []

  // 9월 전월 실적이 없는 로컬 환경이면 기본 실적 충족 내역을 보충한다.
  const hasSeptData = existingTransactions.some((tx) =>
    tx.date.startsWith('2026-09'),
  )
  const transactions = hasSeptData
    ? existingTransactions
    : [...existingTransactions, ...DEFAULT_PREV_MONTH_TRANSACTIONS]

  return {
    version: 1,
    cards,
    transactions,
    settings: { ...DEFAULT_SETTINGS, ...state.settings },
  }
}

function loadState(householdId: string | null): AppState {
  const keys = householdId
    ? [`${STORAGE_KEY}:${householdId}`, STORAGE_KEY]
    : [STORAGE_KEY]

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue

      const parsed = JSON.parse(raw) as AppState
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray(parsed.transactions) ||
        !Array.isArray(parsed.cards)
      ) {
        continue
      }

      return normalize(parsed)
    } catch {
      // 다음 저장 키를 확인한다.
    }
  }

  return createInitialState()
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  return '동기화 중 문제가 발생했어요.'
}

interface AppContextValue {
  state: AppState
  month: string
  setMonth: (month: string) => void
  cloudEnabled: boolean
  syncState: SyncState
  syncError: string
  fixedExpenses: FixedExpense[]
  fixedExpenseApplications: FixedExpenseApplication[]
  addTransaction: (input: Omit<Transaction, 'id'>) => void
  updateTransaction: (transaction: Transaction) => void
  deleteTransaction: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  addCard: (card: Card) => void
  updateCard: (card: Card) => void
  deleteCard: (id: string) => void
  toggleCard: (id: string) => void
  addFixedExpense: (fixedExpense: FixedExpense) => void
  updateFixedExpense: (fixedExpense: FixedExpense) => void
  deleteFixedExpense: (id: string) => void
  applyFixedExpense: (
    fixedExpense: FixedExpense,
    input: {
      date: string
      amount?: number
      merchant?: string
      memo?: string
      categoryId?: CategoryId
      cardId?: string | null
      paymentMethod?: string
      excluded?: boolean
    },
  ) => { ok: boolean; message: string }
  resetToInitial: () => void
  clearAll: () => void
  exportJSON: () => string
  importJSON: (raw: string) => { ok: boolean; message: string }
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const { configured, householdId, signOut } = useAuth()
  const [state, setState] = useState<AppState>(() => loadState(householdId))
  const [month, setMonth] = useState<string>(currentMonth)
  const [cloudLoading, setCloudLoading] = useState(Boolean(configured && householdId))
  const [cloudReady, setCloudReady] = useState(!configured)
  const [bootError, setBootError] = useState('')
  const [syncState, setSyncState] = useState<SyncState>(
    configured ? 'syncing' : 'local',
  )
  const [syncError, setSyncError] = useState('')
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>(
    () => loadFixedExpenseData(householdId).fixedExpenses,
  )
  const [fixedExpenseApplications, setFixedExpenseApplications] = useState<
    FixedExpenseApplication[]
  >(() => loadFixedExpenseData(householdId).fixedExpenseApplications)
  const stateRef = useRef(state)
  const bulkSyncRef = useRef(false)
  const settingsDirtyRef = useRef(false)
  const settingsVersionRef = useRef(0)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    try {
      const key = householdId ? `${STORAGE_KEY}:${householdId}` : STORAGE_KEY
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // 저장 공간이 없어도 앱은 계속 동작한다.
    }
  }, [state, householdId])

  useEffect(() => {
    const local = loadFixedExpenseData(householdId)
    setFixedExpenses(local.fixedExpenses)
    setFixedExpenseApplications(local.fixedExpenseApplications)
  }, [householdId])

  useEffect(() => {
    try {
      localStorage.setItem(
        fixedExpenseStorageKey(householdId),
        JSON.stringify({ fixedExpenses, fixedExpenseApplications }),
      )
    } catch {
      // 저장 공간이 없어도 앱은 계속 동작한다.
    }
  }, [fixedExpenses, fixedExpenseApplications, householdId])

  useEffect(() => {
    if (!householdId) {
      settingsDirtyRef.current = false
      setCloudLoading(false)
      setCloudReady(!configured)
      setBootError('')
      setSyncState(configured ? 'error' : 'local')
      return
    }

    let cancelled = false
    setCloudLoading(true)
    setCloudReady(false)
    setBootError('')
    setSyncState('syncing')
    setSyncError('')

    void (async () => {
      try {
        const initialized = await getHouseholdInitialized(householdId)
        const cloud = await loadCloudState(householdId)

        if (cancelled) return

        setFixedExpenses(cloud.fixedExpenses)
        setFixedExpenseApplications(cloud.fixedExpenseApplications)

        if (
          !initialized &&
          cloud.state.cards.length === 0 &&
          !cloud.hasAnyTransaction
        ) {
          const local = loadState(householdId)
          await replaceCloudState(householdId, local)
          if (cancelled) return
          settingsDirtyRef.current = false
          setState(local)
        } else {
          if (!initialized) {
            await markHouseholdInitialized(householdId)
          }
          if (cancelled) return
          settingsDirtyRef.current = false
          setState(cloud.state)
        }

        setCloudLoading(false)
        setCloudReady(true)
        setBootError('')
        setSyncState('synced')
        setSyncError('')
      } catch (error) {
        if (cancelled) return
        const message = errorMessage(error)
        setCloudLoading(false)
        setCloudReady(false)
        setBootError(message)
        setSyncState('error')
        setSyncError(message)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [configured, householdId])

  const push = useCallback(
    (
      operation: () => Promise<void>,
      onError?: () => void,
      options?: { bulk?: boolean; onSuccess?: () => void },
    ) => {
      if (!householdId || !cloudReady) return

      const bulk = options?.bulk ?? false
      if (bulk) bulkSyncRef.current = true

      setSyncState('syncing')
      void operation()
        .then(() => {
          options?.onSuccess?.()
          setSyncState('synced')
          setSyncError('')
        })
        .catch((error) => {
          onError?.()
          setSyncState('error')
          setSyncError(errorMessage(error))
        })
        .finally(() => {
          if (bulk) bulkSyncRef.current = false
        })
    },
    [cloudReady, householdId],
  )

  useEffect(() => {
    if (!householdId || !cloudReady || !settingsDirtyRef.current) return

    const version = settingsVersionRef.current
    const timer = window.setTimeout(() => {
      push(
        () => saveSettingsRemote(householdId, state.settings),
        undefined,
        {
          onSuccess: () => {
            if (settingsVersionRef.current === version) {
              settingsDirtyRef.current = false
            }
          },
        },
      )
    }, 600)

    return () => window.clearTimeout(timer)
  }, [cloudReady, householdId, push, state.settings])

  useEffect(() => {
    if (!householdId || !cloudReady) return

    const client = supabase
    if (!client) return

    let timer: number | undefined

    const refresh = () => {
      if (bulkSyncRef.current) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (bulkSyncRef.current) return
        void loadCloudState(householdId)
          .then((next) => {
            setState((current) =>
              settingsDirtyRef.current
                ? { ...next.state, settings: current.settings }
                : next.state,
            )
            setFixedExpenses(next.fixedExpenses)
            setFixedExpenseApplications(next.fixedExpenseApplications)
            setSyncState('synced')
            setSyncError('')
          })
          .catch((error) => {
            setSyncState('error')
            setSyncError(errorMessage(error))
          })
      }, 250)
    }

    const channel = client
      .channel(`ledger:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `household_id=eq.${householdId}`,
        },
        refresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cards',
          filter: `household_id=eq.${householdId}`,
        },
        refresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recurring_expenses',
          filter: `household_id=eq.${householdId}`,
        },
        refresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'households',
          filter: `id=eq.${householdId}`,
        },
        refresh,
      )
      .subscribe()

    return () => {
      window.clearTimeout(timer)
      void client.removeChannel(channel)
    }
  }, [cloudReady, householdId])

  const addTransaction = useCallback(
    (input: Omit<Transaction, 'id'>) => {
      const transaction = withSavingsDefaults({ ...input, id: newId() })

      setState((current) => ({
        ...current,
        transactions: [transaction, ...current.transactions],
      }))

      const hid = householdId
      if (!hid) return

      push(
        () => saveTransactionRemote(hid, transaction),
        () => {
          setState((current) => ({
            ...current,
            transactions: current.transactions.filter(
              (item) => item.id !== transaction.id,
            ),
          }))
        },
      )
    },
    [householdId, push],
  )

  const updateTransaction = useCallback(
    (transaction: Transaction) => {
      const nextTransaction = withSavingsDefaults(transaction)
      const previous = stateRef.current.transactions.find(
        (item) => item.id === nextTransaction.id,
      )

      setState((current) => ({
        ...current,
        transactions: current.transactions.map((item) =>
          item.id === nextTransaction.id ? nextTransaction : item,
        ),
      }))

      if (nextTransaction.fixedExpenseId) {
        setFixedExpenseApplications((current) =>
          current.map((application) =>
            application.transactionId === nextTransaction.id
              ? {
                  ...application,
                  date: nextTransaction.date,
                  amount: nextTransaction.amount,
                  month:
                    nextTransaction.fixedExpenseMonth ??
                    nextTransaction.date.slice(0, 7),
                }
              : application,
          ),
        )
      }

      const hid = householdId
      if (!hid) return

      push(
        () => saveTransactionRemote(hid, nextTransaction),
        () => {
          if (!previous) return
          setState((current) => ({
            ...current,
            transactions: current.transactions.map((item) =>
              item.id === previous.id ? previous : item,
            ),
          }))
        },
      )
    },
    [householdId, push],
  )

  const deleteTransaction = useCallback(
    (id: string) => {
      const index = stateRef.current.transactions.findIndex((item) => item.id === id)
      const previous = index >= 0 ? stateRef.current.transactions[index] : undefined

      setState((current) => ({
        ...current,
        transactions: current.transactions.filter((item) => item.id !== id),
      }))
      setFixedExpenseApplications((current) =>
        current.filter(
          (application) =>
            application.transactionId !== id &&
            (!previous?.fixedExpenseId ||
              application.fixedExpenseId !== previous.fixedExpenseId ||
              application.month !== previous.date.slice(0, 7)),
        ),
      )

      const hid = householdId
      if (!hid) return

      push(
        () => deleteTransactionRemote(hid, id),
        () => {
          if (!previous) return
          setState((current) => {
            const transactions = [...current.transactions]
            transactions.splice(Math.min(index, transactions.length), 0, previous)
            return { ...current, transactions }
          })
        },
      )
    },
    [householdId, push],
  )

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    settingsVersionRef.current += 1
    settingsDirtyRef.current = true
    setState((current) => ({
      ...current,
      settings: { ...current.settings, ...patch },
    }))
  }, [])

  const addCard = useCallback(
    (card: Card) => {
      setState((current) => ({
        ...current,
        cards: [card, ...current.cards],
      }))

      const hid = householdId
      if (!hid) return

      push(
        () => saveCardRemote(hid, card),
        () => {
          setState((current) => ({
            ...current,
            cards: current.cards.filter((item) => item.id !== card.id),
          }))
        },
      )
    },
    [householdId, push],
  )

  const updateCard = useCallback(
    (card: Card) => {
      const previous = stateRef.current.cards.find((item) => item.id === card.id)

      setState((current) => ({
        ...current,
        cards: current.cards.map((item) => (item.id === card.id ? card : item)),
      }))

      const hid = householdId
      if (!hid) return

      push(
        () => saveCardRemote(hid, card),
        () => {
          if (!previous) return
          setState((current) => ({
            ...current,
            cards: current.cards.map((item) =>
              item.id === previous.id ? previous : item,
            ),
          }))
        },
      )
    },
    [householdId, push],
  )

  const deleteCard = useCallback(
    (id: string) => {
      const index = stateRef.current.cards.findIndex((item) => item.id === id)
      const previous = index >= 0 ? stateRef.current.cards[index] : undefined

      setState((current) => ({
        ...current,
        cards: current.cards.filter((card) => card.id !== id),
      }))

      const hid = householdId
      if (!hid) return

      push(
        () => deleteCardRemote(hid, id),
        () => {
          if (!previous) return
          setState((current) => {
            const cards = [...current.cards]
            cards.splice(Math.min(index, cards.length), 0, previous)
            return { ...current, cards }
          })
        },
      )
    },
    [householdId, push],
  )

  const toggleCard = useCallback(
    (id: string) => {
      const previous = stateRef.current.cards.find((card) => card.id === id)
      if (!previous) return

      const next = { ...previous, active: !previous.active }

      setState((current) => ({
        ...current,
        cards: current.cards.map((card) =>
          card.id === id ? next : card,
        ),
      }))

      const hid = householdId
      if (!hid) return

      push(
        () => saveCardRemote(hid, next),
        () => {
          setState((current) => ({
            ...current,
            cards: current.cards.map((card) =>
              card.id === id ? previous : card,
            ),
          }))
        },
      )
    },
    [householdId, push],
  )

  const addFixedExpense = useCallback(
    (fixedExpense: FixedExpense) => {
      setFixedExpenses((current) => [fixedExpense, ...current])

      const hid = householdId
      if (!hid) return

      push(
        () => saveFixedExpenseRemote(hid, fixedExpense),
        () => {
          setFixedExpenses((current) =>
            current.filter((item) => item.id !== fixedExpense.id),
          )
        },
      )
    },
    [householdId, push],
  )

  const updateFixedExpense = useCallback(
    (fixedExpense: FixedExpense) => {
      const previous = fixedExpenses.find((item) => item.id === fixedExpense.id)

      setFixedExpenses((current) =>
        current.map((item) =>
          item.id === fixedExpense.id ? fixedExpense : item,
        ),
      )

      const hid = householdId
      if (!hid) return

      push(
        () => saveFixedExpenseRemote(hid, fixedExpense),
        () => {
          if (!previous) return
          setFixedExpenses((current) =>
            current.map((item) => (item.id === previous.id ? previous : item)),
          )
        },
      )
    },
    [fixedExpenses, householdId, push],
  )

  const deleteFixedExpense = useCallback(
    (id: string) => {
      const previous = fixedExpenses.find((item) => item.id === id)
      if (!previous) return

      setFixedExpenses((current) =>
        current.map((item) =>
          item.id === id ? { ...item, active: false } : item,
        ),
      )

      const hid = householdId
      if (!hid) return

      push(
        () => deactivateFixedExpenseRemote(hid, id),
        () => {
          setFixedExpenses((current) =>
            current.map((item) => (item.id === id ? previous : item)),
          )
        },
      )
    },
    [fixedExpenses, householdId, push],
  )

  const applyFixedExpense = useCallback(
    (
      fixedExpense: FixedExpense,
      input: {
        date: string
        amount?: number
        merchant?: string
        memo?: string
        categoryId?: CategoryId
        cardId?: string | null
        paymentMethod?: string
        excluded?: boolean
      },
    ) => {
      const month = input.date.slice(0, 7)
      const existingApplication = fixedExpenseApplications.find(
        (application) =>
          application.fixedExpenseId === fixedExpense.id &&
          application.month === month,
      )
      const isExistingTxAlive =
        existingApplication &&
        state.transactions.some(
          (tx) =>
            (tx.id === existingApplication.transactionId ||
              (tx.fixedExpenseId === fixedExpense.id &&
                tx.date.startsWith(month))) &&
            (tx.status ?? 'active') !== 'canceled',
        )

      if (existingApplication && isExistingTxAlive) {
        return {
          ok: false,
          message: '이번 달에는 이미 반영된 고정지출이에요.',
        }
      }

      const amount = Math.round(input.amount ?? fixedExpense.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, message: '반영할 금액을 확인해 주세요.' }
      }

      const fixedSavings =
        isSavingsCategory(fixedExpense.categoryId) ||
        fixedExpense.categoryMajor === '투자납입' ||
        fixedExpense.categoryGroup === '투자납입'
      const savings = fixedSavings
      const categoryMajor = savings
        ? SAVINGS_SHEET.categoryMajor
        : fixedExpense.categoryMajor
      const categoryMinor = savings
        ? SAVINGS_SHEET.categoryMinor
        : fixedExpense.categoryMinor
      const categoryGroup = savings
        ? SAVINGS_SHEET.categoryGroup
        : fixedExpense.categoryGroup
      const categoryId = savings ? 'savings' : fixedExpense.categoryId

      const transaction = withSavingsDefaults({
        id: newId(),
        date: input.date,
        merchant: input.merchant?.trim() || fixedExpense.name,
        amount,
        categoryId,
        cardId: savings
          ? null
          : input.cardId === undefined
            ? fixedExpense.cardId
            : input.cardId,
        memo: input.memo ?? fixedExpense.memo ?? '',
        excluded: savings
          ? true
          : input.excluded ?? (categoryMajor !== '생활비'),
        categoryMajor,
        categoryMinor,
        categoryGroup,
        correction: 0,
        effectiveAmount: amount,
        paymentMethod: savings
          ? input.paymentMethod ??
            fixedExpense.paymentMethod ??
            '자동이체'
          : input.paymentMethod ??
            fixedExpense.paymentMethod ??
            (fixedExpense.cardId ? '신용카드' : '현금'),
        note: fixedExpense.note,
        status: 'active',
        fixedExpenseId: fixedExpense.id,
        fixedExpenseMonth: month,
      })

      setState((current) => ({
        ...current,
        transactions: [transaction, ...current.transactions],
      }))

      setFixedExpenseApplications((current) => [
        ...current.filter(
          (app) =>
            !(app.fixedExpenseId === fixedExpense.id && app.month === month),
        ),
        {
          fixedExpenseId: fixedExpense.id,
          month,
          transactionId: transaction.id,
          date: transaction.date,
          amount: transaction.amount,
        },
      ])

      const hid = householdId
      if (hid) {
        push(
          () => saveTransactionRemote(hid, transaction),
          () => {
            setState((current) => ({
              ...current,
              transactions: current.transactions.filter(
                (item) => item.id !== transaction.id,
              ),
            }))
            setFixedExpenseApplications((current) =>
              current.filter(
                (application) =>
                  application.transactionId !== transaction.id,
              ),
            )
          },
        )
      }

      return { ok: true, message: '고정지출을 반영했어요.' }
    },
    [fixedExpenseApplications, householdId, push, state.transactions],
  )

  const resetToInitial = useCallback(() => {
    const next = createInitialState()
    settingsVersionRef.current += 1
    settingsDirtyRef.current = false
    setState(next)

    const hid = householdId
    if (!hid) return

    push(() => replaceCloudState(hid, next), undefined, { bulk: true })
  }, [householdId, push])

  const clearAll = useCallback(() => {
    const previous = stateRef.current.transactions

    setState((current) => ({
      ...current,
      transactions: [],
    }))

    const hid = householdId
    if (!hid) return

    push(
      () => clearCloudTransactions(hid),
      () => {
        setState((current) => ({ ...current, transactions: previous }))
      },
      { bulk: true },
    )
  }, [householdId, push])

  const exportJSON = useCallback(() => JSON.stringify(state, null, 2), [state])

  const importJSON = useCallback(
    (raw: string) => {
      try {
        const parsed = JSON.parse(raw) as AppState
        if (
          !parsed ||
          !Array.isArray(parsed.transactions) ||
          !Array.isArray(parsed.cards)
        ) {
          return { ok: false, message: '파일 형식이 올바르지 않아요.' }
        }

        const next = normalize(parsed)
        settingsVersionRef.current += 1
        settingsDirtyRef.current = false
        setState(next)

        const hid = householdId
        if (hid) {
          push(() => replaceCloudState(hid, next), undefined, { bulk: true })
        }

        return { ok: true, message: '가계부 데이터를 불러왔어요.' }
      } catch {
        return { ok: false, message: 'JSON을 읽을 수 없어요.' }
      }
    },
    [householdId, push],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      month,
      setMonth,
      cloudEnabled: Boolean(configured && householdId && cloudReady),
      syncState,
      syncError,
      fixedExpenses,
      fixedExpenseApplications,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      updateSettings,
      addCard,
      updateCard,
      deleteCard,
      toggleCard,
      addFixedExpense,
      updateFixedExpense,
      deleteFixedExpense,
      applyFixedExpense,
      resetToInitial,
      clearAll,
      exportJSON,
      importJSON,
    }),
    [
      state,
      month,
      configured,
      householdId,
      cloudReady,
      syncState,
      syncError,
      fixedExpenses,
      fixedExpenseApplications,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      updateSettings,
      addCard,
      updateCard,
      deleteCard,
      toggleCard,
      addFixedExpense,
      updateFixedExpense,
      deleteFixedExpense,
      applyFixedExpense,
      resetToInitial,
      clearAll,
      exportJSON,
      importJSON,
    ],
  )

  if (configured && bootError) {
    return (
      <div className="auth auth--status">
        <div className="auth__card auth__card--error">
          <div className="auth__brand">
            <span className="brand__mark">쎈</span>
            <div>
              <strong>클라우드 연결 확인</strong>
              <small>가계부 데이터를 불러오지 못했어요</small>
            </div>
          </div>
          <p className="form__error auth__message" role="alert">
            {bootError}
          </p>
          <p className="auth__note auth__note--left">
            <Icon name="check" size={14} />
            네트워크 연결과 Supabase SQL 설정을 확인한 뒤 다시 시도해 주세요.
            온라인 우선 모드에서는 클라우드 데이터를 확인하기 전까지 가계부를
            열지 않습니다.
          </p>
          <div className="auth__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.location.reload()}
            >
              다시 시도
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void signOut()}
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (configured && cloudLoading) {
    return (
      <div className="auth auth--status">
        <div className="auth__status">
          <span className="brand__mark">쎈</span>
          <span className="auth__spinner" aria-hidden="true" />
          <p>가계부를 동기화하는 중...</p>
        </div>
      </div>
    )
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider')
  return context
}
