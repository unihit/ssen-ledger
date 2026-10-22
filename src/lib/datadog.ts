import { datadogRum } from '@datadog/browser-rum'
import { datadogLogs } from '@datadog/browser-logs'

let initialized = false

/**
 * Datadog RUM 및 Browser Logs 초기화
 */
export function initDatadog() {
  if (initialized) return

  const applicationId = import.meta.env.VITE_DATADOG_APPLICATION_ID
  const clientToken = import.meta.env.VITE_DATADOG_CLIENT_TOKEN
  const site = import.meta.env.VITE_DATADOG_SITE || 'datadoghq.com'
  const service = import.meta.env.VITE_DATADOG_SERVICE || 'ssen-ledger'
  const env = import.meta.env.VITE_DATADOG_ENV || import.meta.env.MODE || 'development'
  const version = import.meta.env.VITE_DATADOG_VERSION || '1.0.0'

  if (!applicationId || !clientToken) {
    console.info(
      '[Datadog] VITE_DATADOG_APPLICATION_ID 또는 VITE_DATADOG_CLIENT_TOKEN이 설정되지 않아 Datadog 연동이 비활성화되었습니다.',
    )
    return
  }

  try {
    // 1. RUM (사용자 인터랙션, 성능 지표, 세션 리플레이) 초기화
    datadogRum.init({
      applicationId,
      clientToken,
      site,
      service,
      env,
      version,
      sessionSampleRate: 100, // 전체 세션 중 수집 비율
      sessionReplaySampleRate: 100, // 세션 리플레이 녹화 비율
      trackUserInteractions: true, // 버튼 클릭 등 사용자 액션 자동 추적
      trackResources: true, // 네트워크 요청/리소스 로딩 시간 추적
      trackLongTasks: true, // 메인 스레드 블로킹 추적
      defaultPrivacyLevel: 'mask-user-input', // 가계부 입력값(금액/텍스트) 마스킹 처리
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
    })

    initialized = true
    console.info(`[Datadog] 초기화 완료 (service: ${service}, env: ${env})`)
  } catch (error) {
    console.error('[Datadog] 초기화 실패:', error)
  }
}

/**
 * Supabase 로그인 사용자 정보를 Datadog 세션에 매핑
 */
export function setDatadogUser(user: { id: string; email?: string }) {
  if (!initialized) return
  datadogRum.setUser({
    id: user.id,
    email: user.email,
  })
  datadogLogs.setUser({
    id: user.id,
    email: user.email,
  })
}

/**
 * 로그아웃 시 Datadog 세션의 사용자 정보 해제
 */
export function clearDatadogUser() {
  if (!initialized) return
  datadogRum.clearUser()
  datadogLogs.clearUser()
}
