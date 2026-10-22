import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { AuthScreen, type AuthResult } from '../components/AuthScreen'
import { Icon } from '../components/Icon'
import { clearDatadogUser, setDatadogUser } from './datadog'
import { supabase, supabaseConfigured } from './supabase'

interface AuthContextValue {
  configured: boolean
  user: User | null
  householdId: string | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function mapAuthError(message: string): string {
  const lower = message.toLowerCase()

  if (lower.includes('invalid login credentials')) {
    return '이메일 또는 비밀번호가 올바르지 않아요.'
  }
  if (lower.includes('email not confirmed')) {
    return '이메일 확인 후 로그인해 주세요.'
  }
  if (lower.includes('user already registered')) {
    return '이미 가입된 이메일이에요.'
  }
  if (lower.includes('password should be at least')) {
    return '비밀번호는 6자 이상이어야 해요.'
  }
  if (lower.includes('signup is disabled')) {
    return '현재 회원가입이 비활성화되어 있어요.'
  }

  return message
}

function AuthLoading({ label }: { label: string }) {
  return (
    <div className="auth auth--status">
      <div className="auth__status">
        <span className="brand__mark">쎈</span>
        <span className="auth__spinner" aria-hidden="true" />
        <p>{label}</p>
      </div>
    </div>
  )
}

function SetupError({ message }: { message: string }) {
  return (
    <div className="auth auth--status">
      <div className="auth__card auth__card--error">
        <div className="auth__brand">
          <span className="brand__mark">쎈</span>
          <div>
            <strong>Supabase 설정 확인</strong>
            <small>가계부를 연결하지 못했어요</small>
          </div>
        </div>
        <p className="form__error auth__message" role="alert">
          {message}
        </p>
        <p className="auth__note auth__note--left">
          <Icon name="check" size={14} />
          Supabase SQL Editor에서 <code>supabase/schema.sql</code>을 실행했는지
          확인해 주세요. 테이블과 RLS 정책이 있어야 로그인 후 가계부를 만들 수
          있습니다.
        </p>
        <button
          type="button"
          className="btn btn--primary auth__submit"
          onClick={() => window.location.reload()}
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(supabaseConfigured)
  const [resolving, setResolving] = useState(false)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [setupError, setSetupError] = useState('')

  useEffect(() => {
    if (!supabase) {
      setBooting(false)
      return
    }

    let active = true

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setSetupError(error.message)
      setSession(data.session)
      setBooting(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!active) return
        setSession(nextSession)
        setBooting(false)
      },
    )

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (session?.user) {
      setDatadogUser({ id: session.user.id, email: session.user.email })
    } else {
      clearDatadogUser()
    }
  }, [session?.user.id, session?.user.email])

  useEffect(() => {
    if (!supabase || !session) {
      setHouseholdId(null)
      setResolving(false)
      setSetupError('')
      return
    }

    let active = true
    setResolving(true)
    setSetupError('')

    void supabase
      .rpc('create_household', { p_name: '우리 집' })
      .then(({ data, error }) => {
        if (!active) return

        if (error) {
          setSetupError(error.message)
          setHouseholdId(null)
        } else if (!data) {
          setSetupError('가구 정보를 만들지 못했어요.')
          setHouseholdId(null)
        } else {
          setHouseholdId(String(data))
        }

        setResolving(false)
      })

    return () => {
      active = false
    }
  }, [session?.user.id])

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) {
        return { ok: false, message: 'Supabase가 설정되지 않았어요.' }
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      return error
        ? { ok: false, message: mapAuthError(error.message) }
        : { ok: true }
    },
    [],
  )

  const signUp = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) {
        return { ok: false, message: 'Supabase가 설정되지 않았어요.' }
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
        },
      })

      if (error) {
        return { ok: false, message: mapAuthError(error.message) }
      }

      if (!data.session) {
        return {
          ok: true,
          message: '가입 확인 이메일을 보냈어요. 확인 후 로그인해 주세요.',
        }
      }

      return { ok: true }
    },
    [],
  )

  const signOut = useCallback(async () => {
    if (supabase) {
      try {
        await supabase.auth.signOut()
      } catch {
        // 네트워크 오류가 나도 이 기기에서는 로그아웃 상태로 만든다.
      }
    }
    setSession(null)
    setHouseholdId(null)
    setSetupError('')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: supabaseConfigured,
      user: session?.user ?? null,
      householdId,
      signOut,
    }),
    [householdId, session?.user, signOut],
  )

  if (supabaseConfigured && booting) {
    return <AuthLoading label="로그인 상태를 확인하는 중..." />
  }

  if (supabaseConfigured && !session) {
    return <AuthScreen onSignIn={signIn} onSignUp={signUp} />
  }

  if (supabaseConfigured && setupError) {
    return <SetupError message={setupError} />
  }

  if (supabaseConfigured && (resolving || !householdId)) {
    return <AuthLoading label="가계부를 준비하는 중..." />
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
