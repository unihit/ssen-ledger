import { useCallback, useEffect, useRef, useState } from 'react'

const CHECK_INTERVAL_MS = 60 * 1000

function loadedEntry(): string | null {
  const script = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src]',
  )
  return script?.getAttribute('src') ?? null
}

async function deployedEntry(): Promise<string | null> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}index.html?deploy-check=${Date.now()}`,
    { cache: 'no-store' },
  )
  if (!response.ok) return null
  const html = await response.text()
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return (
    parsed.querySelector<HTMLScriptElement>('script[type="module"][src]')
      ?.getAttribute('src') ?? null
  )
}

/**
 * 배포가 바뀌면 열린 탭이 이전 번들을 계속 쓰게 된다.
 * 탭으로 돌아올 때 새 번들을 확인하고, 있으면 새로고침을 안내한다.
 */
export function UpdateBanner() {
  const [available, setAvailable] = useState(false)
  const availableRef = useRef(false)
  const inFlight = useRef(false)
  const lastCheckedAt = useRef(0)

  const check = useCallback(async () => {
    if (import.meta.env.DEV) return
    if (availableRef.current || inFlight.current) return
    if (Date.now() - lastCheckedAt.current < CHECK_INTERVAL_MS) return

    const current = loadedEntry()
    if (!current) return

    inFlight.current = true
    lastCheckedAt.current = Date.now()
    try {
      const next = await deployedEntry()
      if (next && next !== current) {
        availableRef.current = true
        setAvailable(true)
      }
    } catch {
      // 네트워크가 없으면 다음 확인 때 다시 시도한다.
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    void check()

    const onFocus = () => void check()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void check()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [check])

  if (!available) return null

  return (
    <div className="update-banner" role="status">
      <span>새 버전이 나왔어요.</span>
      <button
        type="button"
        onClick={() => {
          const url = new URL(import.meta.env.BASE_URL, window.location.origin)
          url.searchParams.set('v', String(Date.now()))
          window.location.replace(url.toString())
        }}
      >
        새로고침
      </button>
    </div>
  )
}
