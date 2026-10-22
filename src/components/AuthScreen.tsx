import { useState, type FormEvent } from 'react'
import { Icon } from './Icon'

export interface AuthResult {
  ok: boolean
  message?: string
}

interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<AuthResult>
  onSignUp: (email: string, password: string) => Promise<AuthResult>
}

export function AuthScreen({ onSignIn, onSignUp }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setNotice('')

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 해요.')
      return
    }

    setSubmitting(true)
    try {
      const result =
        mode === 'signin'
          ? await onSignIn(email.trim(), password)
          : await onSignUp(email.trim(), password)

      if (!result.ok) {
        setError(result.message ?? '로그인에 실패했어요. 다시 시도해 주세요.')
        return
      }

      if (result.message) {
        setNotice(result.message)
        if (mode === 'signup') setMode('signin')
        setPassword('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <span className="brand__mark">쎈</span>
          <div>
            <strong>쎈 가계부</strong>
            <small>카드 혜택까지 챙기는 가계부</small>
          </div>
        </div>

        <div className="auth__head">
          <p className="page-head__eyebrow">CLOUD SYNC</p>
          <h1>{mode === 'signin' ? '로그인' : '계정 만들기'}</h1>
          <p>
            {mode === 'signin'
              ? '어느 기기에서든 같은 가계부를 이어서 써보세요.'
              : '이메일 하나로 가계부를 안전하게 동기화할 수 있어요.'}
          </p>
        </div>

        <form className="form auth__form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="auth-email">이메일</label>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              placeholder="you@example.com"
              onChange={(event) => {
                setEmail(event.target.value)
                setError('')
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="auth-password">비밀번호</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              placeholder="6자 이상"
              onChange={(event) => {
                setPassword(event.target.value)
                setError('')
              }}
            />
          </div>

          {error && (
            <p className="form__error auth__message" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="auth__notice" role="status">
              {notice}
            </p>
          )}

          <button
            type="submit"
            className="btn btn--primary auth__submit"
            disabled={submitting}
          >
            <Icon name={mode === 'signin' ? 'wallet' : 'sparkles'} size={18} />
            {submitting
              ? '처리 중...'
              : mode === 'signin'
                ? '로그인'
                : '계정 만들기'}
          </button>
        </form>

        <button
          type="button"
          className="auth__switch"
          onClick={() => {
            setMode((current) => (current === 'signin' ? 'signup' : 'signin'))
            setError('')
            setNotice('')
          }}
        >
          {mode === 'signin'
            ? '계정이 없나요? 회원가입'
            : '이미 계정이 있나요? 로그인'}
        </button>

        <p className="auth__note">
          <Icon name="check" size={14} />
          로그인한 가구의 데이터만 안전하게 동기화됩니다.
        </p>
      </div>
    </div>
  )
}
