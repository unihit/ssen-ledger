import { datadogRum } from '@datadog/browser-rum'
import { datadogLogs } from '@datadog/browser-logs'

let initialized = false
let userVersion = 0

type MutableRecord = Record<string, unknown>

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const SENSITIVE_QUERY_PATTERN =
  /([?&](?:household_id|user_id|email|token|access_token|refresh_token|apikey|api_key|key)=)[^&#\s]*/gi
const LONG_NUMBER_PATTERN = /\b\d{6,}\b/g
const SENSITIVE_KEY_PATTERN =
  /(?:email|token|secret|password|apikey|api_key|household|account|user)/i
const SENSITIVE_CONTEXT_KEY_PATTERN =
  /(?:amount|price|cost|balance|income|expense|spend|spent|savings|memo|merchant|description|note|금액|거래|저축|결제)/i

function asRecord(value: unknown): MutableRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as MutableRecord
}

function redactText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, '[email]')
    .replace(UUID_PATTERN, '[id]')
    .replace(SENSITIVE_QUERY_PATTERN, '$1[redacted]')
    .replace(LONG_NUMBER_PATTERN, '[number]')
}

function redactUrl(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    const url = new URL(value, window.location.origin)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return redactText(`${url.origin}${url.pathname}`)
    }
    return redactText(value.split('?')[0].split('#')[0])
  } catch {
    return redactText(value.split('?')[0].split('#')[0])
  }
}

function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[redacted]'
  if (typeof value === 'string') return redactText(value)
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, depth + 1))
  }
  const record = asRecord(value)
  if (!record) return value

  const result: MutableRecord = {}
  for (const [key, child] of Object.entries(record)) {
    result[key] =
      SENSITIVE_KEY_PATTERN.test(key) ||
      SENSITIVE_CONTEXT_KEY_PATTERN.test(key)
        ? '[redacted]'
        : redactDeep(child, depth + 1)
  }
  return result
}

function sanitizeView(record: MutableRecord) {
  const view = asRecord(record.view)
  if (!view) return
  if ('url' in view) view.url = redactUrl(view.url)
  if ('referrer' in view) view.referrer = redactUrl(view.referrer)
  if (typeof view.name === 'string') view.name = redactText(view.name)
}

function sanitizeError(record: MutableRecord) {
  const error = asRecord(record.error)
  if (!error) return

  if (typeof error.message === 'string') {
    error.message = redactText(error.message)
  }
  if (typeof error.stack === 'string') {
    error.stack = redactText(error.stack)
  }

  const causes = error.causes
  if (Array.isArray(causes)) {
    error.causes = causes.map((cause) => {
      const item = asRecord(cause)
      if (!item) return cause
      if (typeof item.message === 'string') {
        item.message = redactText(item.message)
      }
      if (typeof item.stack === 'string') {
        item.stack = redactText(item.stack)
      }
      return item
    })
  }
}

function sanitizeRumEvent(event: unknown): boolean {
  const record = asRecord(event)
  if (!record) return true

  // 이메일/UUID 등 사용자 식별 정보는 Datadog으로 보내지 않습니다.
  delete record.usr
  delete record.account
  if ('context' in record) record.context = redactDeep(record.context)
  if (typeof record.ddtags === 'string') record.ddtags = redactText(record.ddtags)

  sanitizeView(record)
  sanitizeError(record)

  if (record.type === 'resource') {
    const resource = asRecord(record.resource)
    if (resource && 'url' in resource) resource.url = redactUrl(resource.url)
  }

  if (record.type === 'action') {
    const action = asRecord(record.action)
    const target = action ? asRecord(action.target) : null
    if (target) {
      // 클릭한 요소의 텍스트에 금액/메모가 들어갈 수 있어 이름을 마스킹합니다.
      target.name = '[masked]'
      delete target.text
      delete target.value
    }
  }

  return true
}

function sanitizeLogEvent(event: unknown): boolean {
  const record = asRecord(event)
  if (!record) return true

  delete record.usr
  delete record.account
  if (typeof record.message === 'string') {
    record.message = redactText(record.message)
  }
  if (typeof record.ddtags === 'string') record.ddtags = redactText(record.ddtags)
  if ('context' in record) record.context = redactDeep(record.context)

  sanitizeView(record)
  sanitizeError(record)

  const http = asRecord(record.http)
  if (http && 'url' in http) http.url = redactUrl(http.url)

  return true
}

async function hashUserId(value: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(value),
    )
    return Array.from(new Uint8Array(digest))
      .slice(0, 8)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

/**
 * Datadog RUM 및 Browser Logs 초기화
 *
 * 개인정보 보호 원칙:
 * - 세션 리플레이(화면 녹화)는 기본 비활성화합니다.
 * - 화면 텍스트/입력값/클릭 대상은 Datadog 기본 정책으로 마스킹합니다.
 * - URL 쿼리·해시, 이메일, UUID, 긴 숫자, 민감한 context를 전송 전에 제거합니다.
 * - 로그인 사용자는 원본 UUID/이메일 대신 익명 해시만 전송합니다.
 */
export function initDatadog() {
  if (initialized) return

  if (import.meta.env.VITE_DATADOG_ENABLED === 'false') {
    console.info('[Datadog] VITE_DATADOG_ENABLED=false로 비활성화되었습니다.')
    return
  }

  const applicationId = import.meta.env.VITE_DATADOG_APPLICATION_ID
  const clientToken = import.meta.env.VITE_DATADOG_CLIENT_TOKEN
  const site = import.meta.env.VITE_DATADOG_SITE || 'datadoghq.com'
  const service = import.meta.env.VITE_DATADOG_SERVICE || 'ssen-ledger'
  const env = import.meta.env.VITE_DATADOG_ENV || import.meta.env.MODE || 'development'
  const version = import.meta.env.VITE_DATADOG_VERSION || '1.0.0'
  const replaySampleRate = Number(
    import.meta.env.VITE_DATADOG_REPLAY_SAMPLE_RATE ?? '0',
  )
  const safeReplaySampleRate = Number.isFinite(replaySampleRate)
    ? Math.min(100, Math.max(0, replaySampleRate))
    : 0

  if (!applicationId || !clientToken) {
    console.info(
      '[Datadog] VITE_DATADOG_APPLICATION_ID 또는 VITE_DATADOG_CLIENT_TOKEN이 설정되지 않아 Datadog 연동이 비활성화되었습니다.',
    )
    return
  }

  try {
    // 1. RUM (사용자 인터랙션, 성능 지표) 초기화
    datadogRum.init({
      applicationId,
      clientToken,
      site,
      service,
      env,
      version,
      sessionSampleRate: 100,
      // 화면 녹화는 개인정보 노출을 막기 위해 기본 0입니다.
      sessionReplaySampleRate: safeReplaySampleRate,
      trackUserInteractions: true,
      trackResources: true,
      trackLongTasks: true,
      // 입력값뿐 아니라 화면에 보이는 모든 텍스트를 마스킹합니다.
      defaultPrivacyLevel: 'mask',
      beforeSend: sanitizeRumEvent,
    })

    // 2. Browser Logs (콘솔 에러 자동 수집) 초기화
    datadogLogs.init({
      clientToken,
      site,
      service,
      env,
      version,
      forwardErrorsToLogs: true,
      sessionSampleRate: 100,
      beforeSend: sanitizeLogEvent,
    })

    initialized = true
    console.info(`[Datadog] 초기화 완료 (service: ${service}, env: ${env})`)
  } catch (error) {
    console.error('[Datadog] 초기화 실패:', error)
  }
}

/**
 * Supabase 로그인 사용자 정보를 Datadog 세션에 매핑합니다.
 * 원본 UUID/이메일은 보내지 않고 SHA-256 앞 8바이트만 익명 ID로 사용합니다.
 */
export function setDatadogUser(user: { id: string }) {
  if (!initialized) return

  const version = ++userVersion
  void hashUserId(user.id).then((id) => {
    if (!initialized || version !== userVersion || !id) return
    datadogRum.setUser({ id })
    datadogLogs.setUser({ id })
  })
}

/**
 * 로그아웃 시 Datadog 세션의 사용자 정보 해제
 */
export function clearDatadogUser() {
  userVersion += 1
  if (!initialized) return
  datadogRum.clearUser()
  datadogLogs.clearUser()
}
