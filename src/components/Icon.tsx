import type { ReactNode } from 'react'

export type IconName =
  | 'home'
  | 'ledger'
  | 'card'
  | 'chart'
  | 'settings'
  | 'plus'
  | 'close'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'check'
  | 'trash'
  | 'sparkles'
  | 'search'
  | 'wallet'

const PATHS: Record<IconName, ReactNode> = {
  home: (
    <path d="M4 10.6 12 4l8 6.6V19a1.4 1.4 0 0 1-1.4 1.4h-3.9v-6.2H9.3v6.2H5.4A1.4 1.4 0 0 1 4 19z" />
  ),
  ledger: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 9.5h18M7 15h4" />
    </>
  ),
  chart: <path d="M5 20V11M11 20V5M17 20v-6M3 20h18" />,
  settings: <path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M8 14v6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  check: <path d="M4 12.5l5 5L20 6.5" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  sparkles: (
    <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5z" />
      <path d="M4 9h16M16 13.5h.01" />
    </>
  ),
}

export function Icon({
  name,
  size = 22,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
