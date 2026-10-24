import { Suspense, lazy, useEffect, useState } from 'react'
import { Icon, type IconName } from './components/Icon'
import { TransactionModal } from './components/TransactionModal'
import { useApp } from './store'
import type { Tab } from './nav'
import type { FixedExpense, Transaction } from './types'
import { HomePage } from './pages/HomePage'
import { LedgerPage } from './pages/LedgerPage'

const CardsPage = lazy(() =>
  import('./pages/CardsPage').then((m) => ({ default: m.CardsPage })),
)
const ReportPage = lazy(() =>
  import('./pages/ReportPage').then((m) => ({ default: m.ReportPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'ledger', label: '가계부', icon: 'ledger' },
  { id: 'cards', label: '카드', icon: 'card' },
  { id: 'report', label: '리포트', icon: 'chart' },
  { id: 'settings', label: '설정', icon: 'settings' },
]

export default function App() {
  const { month } = useApp()
  const [tab, setTab] = useState<Tab>('home')
  const [editor, setEditor] = useState<{
    transaction?: Transaction
    fixedExpense?: FixedExpense
  } | null>(null)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  const openAdd = () => setEditor({})
  const openEdit = (transaction: Transaction) => setEditor({ transaction })
  const openFixedExpense = (fixedExpense: FixedExpense) =>
    setEditor({ fixedExpense })

  const nav = (mobile: boolean) => (
    <nav
      className={`nav ${mobile ? 'nav--mobile' : 'nav--desktop'}`}
      aria-label="주요 메뉴"
    >
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`nav__item${tab === item.id ? ' is-active' : ''}`}
          onClick={() => setTab(item.id)}
          aria-current={tab === item.id ? 'page' : undefined}
        >
          <Icon name={item.icon} size={mobile ? 21 : 18} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <button
            type="button"
            className="brand"
            onClick={() => setTab('home')}
            aria-label="쎈 가계부 홈으로"
          >
            <span className="brand__mark">쎈</span>
            <span className="brand__text">
              <strong>쎈 가계부</strong>
              <small>카드 혜택까지 챙기는 가계부</small>
            </span>
          </button>
          {nav(false)}
        </div>
      </header>

      <main className="main">
        <Suspense fallback={<div className="page" />}>
          {tab === 'home' && (
            <HomePage onAdd={openAdd} onEdit={openEdit} onNavigate={setTab} />
          )}
          {tab === 'ledger' && (
            <LedgerPage
              onAdd={openAdd}
              onEdit={openEdit}
              onApplyFixedExpense={openFixedExpense}
            />
          )}
          {tab === 'cards' && <CardsPage />}
          {tab === 'report' && <ReportPage />}
          {tab === 'settings' && <SettingsPage />}
        </Suspense>
      </main>

      <button
        type="button"
        className="fab"
        onClick={openAdd}
        aria-label="결제 추가"
      >
        <Icon name="plus" size={26} />
      </button>

      {nav(true)}

      {editor && (
        <TransactionModal
          key={
            editor.transaction?.id ??
            editor.fixedExpense?.id ??
            'new'
          }
          initial={editor.transaction}
          fixedExpense={editor.fixedExpense}
          month={month}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  )
}
