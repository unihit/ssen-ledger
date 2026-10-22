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
import { createInitialState } from './data/sample'
import { currentMonth } from './lib/date'
import { useAuth } from './lib/auth'
import {
  clearCloudTransactions,
  deleteCardRemote,
  deleteTransactionRemote,
  getHouseholdInitialized,
  loadCloudState,
  markHouseholdInitialized,
  replaceCloudState,
  saveCardRemote,
  saveSettingsRemote,
  saveTransactionRemote,
} from './lib/cloud'
import { supabase } from './lib/supabase'
import type { AppState, Card, Settings, Transaction } from './types'

const STORAGE_KEY = 'ssen-ledger-state-v2'

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

function normalize(state: AppState): AppState {
  const cards = Array.isArray(state.cards)
    ? state.cards.filter((card) => !RETIRED_CARD_IDS.has(card.id))
    : createInitialState().cards
  const transactions = Array.isArray(state.transactions)
    ? state.transactions.filter(
        (transaction) =>
          !transaction.cardId || !RETIRED_CARD_IDS.has(transaction.cardId),
      )
    : []

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
  addTransaction: (input: Omit<Transaction, 'id'>) => void
  updateTransaction: (transaction: Transaction) => void
  deleteTransaction: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  addCard: (card: Card) => void
  updateCard: (card: Card) => void
  deleteCard: (id: string) => void
  toggleCard: (id: string) => void
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
      const transaction = { ...input, id: newId() }

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
      const previous = stateRef.current.transactions.find(
        (item) => item.id === transaction.id,
      )

      setState((current) => ({
        ...current,
        transactions: current.transactions.map((item) =>
          item.id === transaction.id ? transaction : item,
        ),
      }))

      const hid = householdId
      if (!hid) return

      push(
        () => saveTransactionRemote(hid, transaction),
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
      addTransaction,
      updateTransaction,
      deleteTransaction,
      updateSettings,
      addCard,
      updateCard,
      deleteCard,
      toggleCard,
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
      addTransaction,
      updateTransaction,
      deleteTransaction,
      updateSettings,
      addCard,
      updateCard,
      deleteCard,
      toggleCard,
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
