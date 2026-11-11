// 쎈 가계부 · Muse용 단일 API 키 REST API
// Supabase Edge Function: agent-api
//
// 필요한 Secrets
//   AGENT_API_KEY          Muse가 Authorization: Bearer 로 보낼 키 (1개)
//   AGENT_HOUSEHOLD_ID     (선택) 가구 UUID. 없으면 household가 1개일 때 자동 선택
//   SUPABASE_URL           Supabase Edge Function에서 자동 제공
//   SUPABASE_SECRET_KEYS  새 secret key JSON (자동 제공, ['default'] 사용)
//   SUPABASE_SERVICE_ROLE_KEY  legacy fallback (자동 제공)
//
// 배포: supabase functions deploy agent-api --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2'

const TRANSACTION_TYPES = [
  '수입',
  '생활비',
  '투자납입',
  '투자회수',
  '대출차입',
  '대출상환',
  '계좌이체',
] as const

const PAYMENT_METHODS = [
  '계좌이체',
  '신용카드',
  '체크카드',
  '간편결제',
  '현금',
  '자동이체',
  '기타',
  '컬쳐랜드 문화상품권',
] as const

const BALANCE_COLUMNS = [
  { key: 'cashAccount', sheet: 'B', label: '통장현금(원)' },
  { key: 'securitiesKrw', sheet: 'C', label: '증권원화예수금' },
  { key: 'foreignCashKrw', sheet: 'D', label: '외화현금 원화환산' },
  { key: 'overdraftUsed', sheet: 'E', label: '마통 사용잔액' },
  { key: 'familyLoan', sheet: 'F', label: '가족차입 잔액' },
  { key: 'otherLoan', sheet: 'G', label: '기타대출 잔액' },
] as const

const BALANCE_KEYS = [
  'cashAccount',
  'securitiesKrw',
  'foreignCashKrw',
  'overdraftUsed',
  'familyLoan',
  'otherLoan',
] as const

const SHEET_TO_APP_CATEGORY: Record<string, string> = {
  '수입|급여': 'etc',
  '수입|수당': 'etc',
  '수입|배당·이자': 'etc',
  '수입|기타수입': 'etc',
  '생활비|주거': 'housing',
  '생활비|통신': 'telecom',
  '생활비|생활': 'living',
  '생활비|마트': 'mart',
  '생활비|외식비': 'food',
  '생활비|회사식비': 'food',
  '생활비|건강': 'medical',
  '생활비|교통': 'transport',
  '생활비|경조사': 'events',
  '생활비|상품권': 'giftcard',
  '생활비|보험료': 'insurance',
  '생활비|회비': 'dues',
  '생활비|기부금': 'donation',
  '생활비|의복/미용': 'shopping',
  '생활비|카페': 'cafe',
  '생활비|자동차': 'fuel',
  '생활비|대출이자': 'etc',
  '생활비|차입금이자': 'etc',
  '생활비|구독': 'subscription',
  '생활비|기타': 'etc',
  '생활비|게임': 'game',
  '투자납입|예적금': 'savings',
  '투자납입|IRP·연금': 'savings',
  '투자납입|ISA': 'savings',
  '투자납입|국내주식': 'savings',
  '투자납입|해외주식': 'savings',
  '투자납입|기타투자': 'savings',
  '투자회수|예적금': 'etc',
  '투자회수|IRP·연금': 'etc',
  '투자회수|ISA': 'etc',
  '투자회수|국내주식': 'etc',
  '투자회수|해외주식': 'etc',
  '투자회수|기타투자': 'etc',
  '대출차입|마이너스통장': 'etc',
  '대출차입|가족차입': 'etc',
  '대출차입|기타대출': 'etc',
  '대출상환|마이너스통장': 'etc',
  '대출상환|가족차입': 'etc',
  '대출상환|차입원금상환': 'etc',
  '대출상환|기타대출': 'etc',
  '계좌이체|본인계좌이체': 'etc',
}

const APP_CATEGORY_TO_SHEET: Record<string, { major: string; minor: string }> = {
  food: { major: '생활비', minor: '외식비' },
  cafe: { major: '생활비', minor: '카페' },
  mart: { major: '생활비', minor: '마트' },
  delivery: { major: '생활비', minor: '외식비' },
  shopping: { major: '생활비', minor: '의복/미용' },
  transport: { major: '생활비', minor: '교통' },
  telecom: { major: '생활비', minor: '통신' },
  subscription: { major: '생활비', minor: '구독' },
  travel: { major: '생활비', minor: '기타' },
  culture: { major: '생활비', minor: '기타' },
  game: { major: '생활비', minor: '게임' },
  medical: { major: '생활비', minor: '건강' },
  insurance: { major: '생활비', minor: '보험료' },
  living: { major: '생활비', minor: '생활' },
  housing: { major: '생활비', minor: '주거' },
  events: { major: '생활비', minor: '경조사' },
  dues: { major: '생활비', minor: '회비' },
  donation: { major: '생활비', minor: '기부금' },
  education: { major: '생활비', minor: '기타' },
  fuel: { major: '생활비', minor: '자동차' },
  giftcard: { major: '생활비', minor: '상품권' },
  savings: { major: '투자납입', minor: '예적금' },
  etc: { major: '생활비', minor: '기타' },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
}

const APP_SPENDING_CATEGORIES = [
  { id: 'food', label: '식비', emoji: '🍚' },
  { id: 'cafe', label: '카페·간식', emoji: '☕' },
  { id: 'mart', label: '마트·편의점', emoji: '🛒' },
  { id: 'delivery', label: '배달', emoji: '🛵' },
  { id: 'shopping', label: '쇼핑', emoji: '🛍️' },
  { id: 'transport', label: '대중교통', emoji: '🚇' },
  { id: 'telecom', label: '통신', emoji: '📱' },
  { id: 'subscription', label: '구독', emoji: '🎬' },
  { id: 'travel', label: '여행·숙박', emoji: '✈️' },
  { id: 'culture', label: '문화·여가', emoji: '🎨' },
  { id: 'game', label: '게임', emoji: '🎮' },
  { id: 'medical', label: '의료·건강', emoji: '💊' },
  { id: 'insurance', label: '보험', emoji: '🛡️' },
  { id: 'living', label: '생활·생필품', emoji: '🧺' },
  { id: 'housing', label: '주거', emoji: '🏠' },
  { id: 'events', label: '경조사', emoji: '💌' },
  { id: 'dues', label: '회비', emoji: '👥' },
  { id: 'donation', label: '기부금', emoji: '🤲' },
  { id: 'education', label: '교육', emoji: '📚' },
  { id: 'etc', label: '기타', emoji: '📦' },
] as const

const DEFAULT_SETTINGS = {
  monthlyIncome: 3_400_000,
  monthlyBudget: 1_600_000,
  monthlyGoal: 1_500_000,
  categoryBudgets: {
    food: 150_000,
    cafe: 60_000,
    mart: 120_000,
    delivery: 80_000,
    shopping: 150_000,
    transport: 160_000,
    telecom: 60_000,
    subscription: 50_000,
    travel: 90_000,
    culture: 65_000,
    game: 50_000,
    medical: 150_000,
    insurance: 60_000,
    living: 80_000,
    housing: 0,
    events: 0,
    dues: 0,
    donation: 0,
    education: 45_000,
    etc: 110_000,
  },
}

const CATEGORY_LABEL_ALIASES: Record<string, string> = {
  food: 'food',
  식비: 'food',
  외식: 'food',
  식사: 'food',
  cafe: 'cafe',
  카페: 'cafe',
  간식: 'cafe',
  '카페·간식': 'cafe',
  '카페/간식': 'cafe',
  mart: 'mart',
  마트: 'mart',
  편의점: 'mart',
  '마트·편의점': 'mart',
  '마트/편의점': 'mart',
  delivery: 'delivery',
  배달: 'delivery',
  shopping: 'shopping',
  쇼핑: 'shopping',
  '의복/미용': 'shopping',
  giftcard: 'giftcard',
  상품권: 'giftcard',
  simplepay: 'simplepay',
  간편결제: 'simplepay',
  페이: 'simplepay',
  transport: 'transport',
  교통: 'transport',
  대중교통: 'transport',
  fuel: 'fuel',
  주유: 'fuel',
  차량: 'fuel',
  자동차: 'fuel',
  '주유·차량': 'fuel',
  '주유/차량': 'fuel',
  telecom: 'telecom',
  통신: 'telecom',
  통신비: 'telecom',
  subscription: 'subscription',
  구독: 'subscription',
  OTT: 'subscription',
  travel: 'travel',
  여행: 'travel',
  숙박: 'travel',
  '여행·숙박': 'travel',
  '여행/숙박': 'travel',
  culture: 'culture',
  문화: 'culture',
  여가: 'culture',
  '문화·여가': 'culture',
  '문화/여가': 'culture',
  game: 'game',
  게임: 'game',
  medical: 'medical',
  의료: 'medical',
  건강: 'medical',
  병원: 'medical',
  약국: 'medical',
  '의료·건강': 'medical',
  '의료/건강': 'medical',
  insurance: 'insurance',
  보험: 'insurance',
  보험료: 'insurance',
  living: 'living',
  생활: 'living',
  생필품: 'living',
  '생활·생필품': 'living',
  '생활/생필품': 'living',
  housing: 'housing',
  house: 'housing',
  rent: 'housing',
  주거: 'housing',
  월세: 'housing',
  관리비: 'housing',
  주거비: 'housing',
  events: 'events',
  event: 'events',
  familyevents: 'events',
  celebration: 'events',
  경조사: 'events',
  경조사비: 'events',
  축의금: 'events',
  조의금: 'events',
  dues: 'dues',
  membership: 'dues',
  회비: 'dues',
  모임회비: 'dues',
  donation: 'donation',
  donations: 'donation',
  charity: 'donation',
  기부금: 'donation',
  기부: 'donation',
  후원: 'donation',
  후원금: 'donation',
  education: 'education',
  교육: 'education',
  학원: 'education',
  etc: 'etc',
  기타: 'etc',
}

function normalizeCategoryKey(key: string): string | null {
  const trimmed = key.trim()
  const matched =
    CATEGORY_LABEL_ALIASES[trimmed] ??
    CATEGORY_LABEL_ALIASES[trimmed.toLowerCase()] ??
    null
  if (!matched) return null
  return APP_SPENDING_CATEGORIES.some((c) => c.id === matched) ? matched : null
}

class ApiError extends Error {
  status: number
  code: string
  fields?: Record<string, string>
  details?: Record<string, unknown>

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
    this.details = details
  }
}

let client: any = null
let cachedHouseholdId: string | null = null

function dbKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, unknown>
      if (typeof keys.default === 'string' && keys.default) {
        return keys.default
      }
    } catch {
      // fall through to the legacy key
    }
  }

  return (
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SERVICE_ROLE_KEY') ??
    ''
  )
}

function db(): any {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = dbKey()

  if (!url || !key) {
    throw new ApiError(
      500,
      'CONFIG_ERROR',
      'SUPABASE_URL 또는 SUPABASE_SECRET_KEYS/SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.',
    )
  }

  if (!client) {
    const options: any = {
      auth: { persistSession: false, autoRefreshToken: false },
    }

    // supabase-js also sends the client key as a Bearer token by default.
    // New sb_* keys are not JWTs and must only be sent in the apikey header.
    if (key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')) {
      options.global = {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const headers = new Headers(init?.headers)
          if (headers.get('authorization') === `Bearer ${key}`) {
            headers.delete('authorization')
          }
          return fetch(input, { ...init, headers })
        },
      }
    }

    client = createClient(url, key, options)
  }

  return client
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function dataResponse(data: unknown, status = 200, extra?: Record<string, unknown>) {
  return jsonResponse({ data, ...(extra ?? {}) }, status)
}

function errorResponse(error: ApiError) {
  return jsonResponse(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        ...(error.details ? error.details : {}),
      },
    },
    error.status,
  )
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

function requireApiKey(req: Request) {
  const configured = (Deno.env.get('AGENT_API_KEY') ?? '').trim()
  if (!configured) {
    throw new ApiError(
      500,
      'CONFIG_ERROR',
      'AGENT_API_KEY가 설정되지 않았습니다. Supabase Edge Function Secret을 확인해 주세요.',
    )
  }

  const header = req.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match || !safeEqual(match[1].trim(), configured)) {
    throw new ApiError(401, 'UNAUTHORIZED', 'API 키가 올바르지 않습니다.')
  }
}

async function resolveHouseholdId(): Promise<string> {
  const configured = (Deno.env.get('AGENT_HOUSEHOLD_ID') ?? '').trim()
  if (configured) {
    if (!UUID_RE.test(configured)) {
      throw new ApiError(
        500,
        'CONFIG_ERROR',
        'AGENT_HOUSEHOLD_ID가 UUID 형식이 아닙니다.',
      )
    }

    if (!cachedHouseholdId) {
      const { data, error } = await db()
        .from('households')
        .select('id')
        .eq('id', configured)
        .maybeSingle()

      if (error) throw dbError(error)
      if (!data) {
        throw new ApiError(
          500,
          'CONFIG_ERROR',
          'AGENT_HOUSEHOLD_ID에 해당하는 가구가 없습니다.',
        )
      }
      cachedHouseholdId = configured
    }

    return cachedHouseholdId ?? configured
  }

  if (cachedHouseholdId) return cachedHouseholdId

  const { data, error } = await db()
    .from('households')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(2)

  if (error) throw dbError(error)

  if (!data || data.length === 0) {
    throw new ApiError(
      500,
      'CONFIG_ERROR',
      '가구가 없습니다. 앱에서 가구를 먼저 만들어 주세요.',
    )
  }

  if (data.length > 1) {
    throw new ApiError(
      500,
      'CONFIG_ERROR',
      '가구가 여러 개입니다. AGENT_HOUSEHOLD_ID를 지정해 주세요.',
    )
  }

  const householdId = data[0].id as string
  cachedHouseholdId = householdId
  return householdId
}

function dbError(error: { code?: string; message?: string }) {
  if (error.code === '23505') {
    return new ApiError(409, 'CONFLICT', '이미 같은 ID의 데이터가 있습니다.')
  }
  if (error.code === '23503') {
    return new ApiError(
      400,
      'VALIDATION_ERROR',
      '연결된 카드나 가구를 찾을 수 없습니다.',
    )
  }
  if (error.code === '23514') {
    return new ApiError(400, 'VALIDATION_ERROR', '허용되지 않는 값이 있습니다.')
  }
  if (error.code === '42703' || error.code === '42P01') {
    return new ApiError(
      500,
      'SCHEMA_ERROR',
      'API용 스키마가 없습니다. supabase/agent-api.sql을 먼저 실행해 주세요.',
    )
  }
  return new ApiError(500, 'DB_ERROR', '데이터베이스 오류가 발생했습니다.')
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text()
  if (!text.trim()) return {}

  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    return parsed as Record<string, unknown>
  } catch {
    throw new ApiError(
      400,
      'INVALID_JSON',
      'JSON 본문을 확인해 주세요. 객체 형식이어야 합니다.',
    )
  }
}

function todayKst() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function isDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function normalizeMonth(value: string | null, field = 'month') {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', '월 형식이 올바르지 않습니다.', {
      [field]: 'YYYY-MM 형식이어야 합니다.',
    })
  }

  const [year, month] = value.split('-').map(Number)
  if (month < 1 || month > 12) {
    throw new ApiError(400, 'VALIDATION_ERROR', '월 형식이 올바르지 않습니다.', {
      [field]: '01월부터 12월 사이여야 합니다.',
    })
  }

  return `${year}-${String(month).padStart(2, '0')}`
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const nextYear = monthNumber === 12 ? year + 1 : year
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
    nextMonthStart: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
    lastDay,
  }
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function appCategoryId(categoryMajor: string, categoryMinor: string) {
  return (
    SHEET_TO_APP_CATEGORY[`${categoryMajor}|${categoryMinor}`] ??
    (categoryMajor === '투자납입' ? 'savings' : 'etc')
  )
}

function effectiveAmount(row: Record<string, unknown>) {
  const generated = Number(row.effective_amount)
  if (Number.isFinite(generated)) return generated
  return (Number(row.amount) || 0) + (Number(row.correction) || 0)
}

function normalizeAliases(raw: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...raw }

  if (out.categoryMajor === undefined && out.type !== undefined) {
    out.categoryMajor = out.type
  }
  if (out.categoryMajor === undefined && out.transactionType !== undefined) {
    out.categoryMajor = out.transactionType
  }
  if (out.categoryMinor === undefined && out.subcategory !== undefined) {
    out.categoryMinor = out.subcategory
  }

  // Agent가 앱 카테고리 ID만 보내도 저축/상품권 거래를 정규화합니다.
  if (out.categoryId === 'savings') {
    if (out.categoryMajor === undefined) out.categoryMajor = '투자납입'
    if (out.categoryMinor === undefined) out.categoryMinor = '예적금'
  } else if (out.categoryId === 'giftcard') {
    if (out.categoryMajor === undefined) out.categoryMajor = '생활비'
    if (out.categoryMinor === undefined) out.categoryMinor = '상품권'
  }

  if (out.excludeFromSpend === undefined) {
    if (out.exclude_from_spend !== undefined) {
      out.excludeFromSpend = Boolean(out.exclude_from_spend)
    } else if (out.isSpendExcluded !== undefined) {
      out.excludeFromSpend = Boolean(out.isSpendExcluded)
    } else if (out.spendExcluded !== undefined) {
      out.excludeFromSpend = Boolean(out.spendExcluded)
    }
  }

  if (out.categoryGroup === undefined && out.category_group !== undefined) {
    out.categoryGroup = out.category_group
  }

  const path = out.category ?? out.categoryPath
  if (
    (out.categoryMajor === undefined || out.categoryMinor === undefined) &&
    typeof path === 'string'
  ) {
    const separator = path.indexOf('-')
    if (separator > 0) {
      if (out.categoryMajor === undefined) {
        out.categoryMajor = path.slice(0, separator)
      }
      if (out.categoryMinor === undefined) {
        out.categoryMinor = path.slice(separator + 1)
      }
    }
  }

  if (out.merchant === undefined && out.payee !== undefined) {
    out.merchant = out.payee
  }
  if (out.memo === undefined && out.description !== undefined) {
    out.memo = out.description
  }

  // '카카오T 간편결제', '카카오페이'처럼 결제수단을 풀어 써도 간편결제로 통일합니다.
  if (typeof out.paymentMethod === 'string') {
    const compact = out.paymentMethod.replace(/\s+/g, '').toLowerCase()
    if (
      compact.includes('간편결제') ||
      /(카카오페이|네이버페이|토스페이|ssg페이|11pay|스마일페이|삼성페이|애플페이|구글페이)/i.test(
        compact,
      )
    ) {
      out.paymentMethod = '간편결제'
    }
  }

  // Muse가 카드 ID 대신 사용자가 말한 카드 이름을 보내도 서버에서 찾습니다.
  if (out.cardName !== undefined) {
    out.cardId = out.cardName
  } else if (out.card_name !== undefined) {
    out.cardId = out.card_name
  } else if (out.cardId === undefined && typeof out.card === 'string') {
    out.cardId = out.card
  }

  return out
}

interface NormalizedTransaction {
  id?: string
  date: string
  categoryMajor: string
  categoryMinor: string
  amount: number
  correction: number
  merchant: string
  memo: string
  note: string
  paymentMethod: string | null
  cardId: string | null
  excludeFromSpend?: boolean
  excluded?: boolean
  categoryGroup?: string
  source?: string
}

function validateTransactionInput(raw: Record<string, unknown>): NormalizedTransaction {
  const body = normalizeAliases(raw)
  const fields: Record<string, string> = {}

  const date = typeof body.date === 'string' ? body.date.trim() : body.date
  if (date === undefined || date === null || date === '') {
    fields.date = '필수입니다.'
  } else if (typeof date !== 'string' || !isDateString(date)) {
    fields.date = 'YYYY-MM-DD 형식이어야 합니다.'
  }

  const categoryMajor =
    typeof body.categoryMajor === 'string'
      ? body.categoryMajor.trim()
      : body.categoryMajor
  if (categoryMajor === undefined || categoryMajor === null || categoryMajor === '') {
    fields.categoryMajor = '필수입니다.'
  } else if (
    typeof categoryMajor !== 'string' ||
    !TRANSACTION_TYPES.includes(categoryMajor as (typeof TRANSACTION_TYPES)[number])
  ) {
    fields.categoryMajor =
      '수입, 생활비, 투자납입, 투자회수, 대출차입, 대출상환, 계좌이체 중 하나여야 합니다.'
  }

  const categoryMinor =
    typeof body.categoryMinor === 'string'
      ? body.categoryMinor.trim()
      : body.categoryMinor
  if (categoryMinor === undefined || categoryMinor === null || categoryMinor === '') {
    fields.categoryMinor = '필수입니다.'
  } else if (typeof categoryMinor !== 'string') {
    fields.categoryMinor = '문자열이어야 합니다.'
  }

  const amount = body.amount
  if (amount === undefined || amount === null) {
    fields.amount = '필수입니다.'
  } else if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    fields.amount = '정수여야 합니다.'
  } else if (amount < 0) {
    fields.amount = '0 이상이어야 합니다.'
  }

  const correction = body.correction === undefined ? 0 : body.correction
  if (typeof correction !== 'number' || !Number.isInteger(correction)) {
    fields.correction = '정수여야 합니다.'
  }

  const merchant = body.merchant === undefined || body.merchant === null ? '' : body.merchant
  if (typeof merchant !== 'string') {
    fields.merchant = '문자열이어야 합니다.'
  } else if (merchant.length > 200) {
    fields.merchant = '200자 이하여야 합니다.'
  }

  const memo = body.memo === undefined || body.memo === null ? '' : body.memo
  if (typeof memo !== 'string') {
    fields.memo = '문자열이어야 합니다.'
  } else if (memo.length > 500) {
    fields.memo = '500자 이하여야 합니다.'
  }

  const note = body.note === undefined || body.note === null ? '' : body.note
  if (typeof note !== 'string') {
    fields.note = '문자열이어야 합니다.'
  } else if (note.length > 500) {
    fields.note = '500자 이하여야 합니다.'
  }

  let paymentMethod = body.paymentMethod
  if (paymentMethod === undefined || paymentMethod === null || paymentMethod === '') {
    paymentMethod = null
  } else if (typeof paymentMethod !== 'string') {
    fields.paymentMethod = '문자열이어야 합니다.'
  } else if (paymentMethod.length > 200) {
    fields.paymentMethod = '결제수단 또는 카드 이름은 200자 이하여야 합니다.'
  } else if (
    !PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number])
  ) {
    // 카드 이름을 결제수단 자리에 보낸 경우 create/update에서 카드로 변환합니다.
  }

  let cardId = body.cardId
  if (cardId === undefined || cardId === null || cardId === '') {
    cardId = null
  } else if (typeof cardId !== 'string') {
    fields.cardId = '문자열이어야 합니다.'
  } else if (cardId.length > 200) {
    fields.cardId = '카드 ID 또는 이름은 200자 이하여야 합니다.'
  }

  const id = body.id
  if (id !== undefined && id !== null) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      fields.id = 'UUID 형식이어야 합니다.'
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      '입력값을 확인해 주세요.',
      fields,
    )
  }

  return {
    id: typeof id === 'string' ? id : undefined,
    date: date as string,
    categoryMajor: categoryMajor as string,
    categoryMinor: categoryMinor as string,
    amount: amount as number,
    correction: correction as number,
    merchant: (merchant as string).trim(),
    memo: (memo as string).trim(),
    note: (note as string).trim(),
    paymentMethod: paymentMethod as string | null,
    cardId: cardId as string | null,
    excludeFromSpend:
      typeof body.excludeFromSpend === 'boolean'
        ? body.excludeFromSpend
        : undefined,
    excluded: typeof body.excluded === 'boolean' ? body.excluded : undefined,
    categoryGroup:
      typeof body.categoryGroup === 'string'
        ? body.categoryGroup.trim()
        : undefined,
    source:
      typeof body.source === 'string' && body.source.trim()
        ? body.source.trim()
        : undefined,
  }
}

async function resolveCategory(categoryMajor: string, categoryMinor: string) {
  const { data, error } = await db()
    .from('ledger_categories')
    .select('category_major, category_minor, category_group')
    .eq('category_major', categoryMajor)
    .eq('category_minor', categoryMinor)
    .maybeSingle()

  if (error) throw dbError(error)
  if (!data) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      '분류기준에 없는 대분류-소분류 조합입니다.',
      {
        categoryMinor: `${categoryMajor}-${categoryMinor} 조합을 찾을 수 없습니다.`,
      },
    )
  }

  return data
}

interface CardSummary {
  id: string
  name: string
  issuer: string | null
  kind: string | null
  active: boolean
}

async function listCards(householdId: string): Promise<CardSummary[]> {
  const { data, error } = await db()
    .from('cards')
    .select('id, name, issuer, kind, active')
    .eq('household_id', householdId)
    .order('name', { ascending: true })

  if (error) throw dbError(error)

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    issuer: row.issuer == null ? null : String(row.issuer),
    kind: row.kind == null ? null : String(row.kind),
    active: row.active !== false,
  }))
}

/** 띄어쓰기·기호·'카드' 접미사를 무시하고 카드 이름을 비교하기 위한 키입니다. */
function normalizeCardText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_+.,/()·'"“”‘’]/g, '')
    .replace(/카드$/, '')
}

async function findCard(
  householdId: string,
  cardRef: string | null,
  field: 'cardId' | 'paymentMethod' = 'cardId',
): Promise<CardSummary | null> {
  if (!cardRef) return null

  const cards = await listCards(householdId)
  const direct = cards.find((card) => card.id === cardRef)
  if (direct) return direct

  const needle = normalizeCardText(cardRef)
  if (!needle) {
    throw new ApiError(400, 'VALIDATION_ERROR', '카드 이름을 확인해 주세요.', {
      [field]: '카드 ID 또는 카드 이름이 필요합니다.',
    })
  }

  const exact = cards.find((card) => normalizeCardText(card.name) === needle)
  if (exact) return exact

  const candidates = cards.filter((card) => {
    const name = normalizeCardText(card.name)
    return name.includes(needle) || needle.includes(name)
  })

  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      '카드 이름이 여러 카드와 일치합니다.',
      {
        [field]: `후보: ${candidates.map((card) => card.name).join(', ')}`,
      },
    )
  }

  throw new ApiError(400, 'VALIDATION_ERROR', '카드를 찾을 수 없습니다.', {
    [field]: `이 가구에 '${cardRef}' 카드가 없습니다.`,
  })
}

async function resolveCardAndPayment(
  householdId: string,
  input: NormalizedTransaction,
) {
  const methodIsCardName =
    !!input.paymentMethod &&
    !PAYMENT_METHODS.includes(input.paymentMethod as (typeof PAYMENT_METHODS)[number])
  const cardRef = input.cardId ?? (methodIsCardName ? input.paymentMethod : null)
  const card = await findCard(
    householdId,
    cardRef,
    input.cardId ? 'cardId' : 'paymentMethod',
  )

  let paymentMethod = input.paymentMethod
  if (card && methodIsCardName) {
    paymentMethod = card.kind === 'check' ? '체크카드' : '신용카드'
  }

  return { cardId: card?.id ?? null, paymentMethod }
}

function duplicateKey(row: Record<string, unknown>) {
  return JSON.stringify([
    row.date,
    row.category_major,
    row.category_minor,
    Number(row.amount) || 0,
    Number(row.correction) || 0,
    row.merchant ?? '',
    row.memo ?? '',
  ])
}

function withReview(
  row: Record<string, unknown>,
  alerts: string[],
): Record<string, unknown> {
  const uniqueAlerts = Array.from(new Set(alerts))
  return {
    ...row,
    input_status: '정상',
    review_alerts: uniqueAlerts,
    review_alert: uniqueAlerts[0] ?? null,
  }
}

function annotateRows(rows: Record<string, unknown>[]) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (row.status === 'canceled') continue
    const key = duplicateKey(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const today = todayKst()
  return rows.map((row) => {
    if (row.status === 'canceled') return withReview(row, [])
    const alerts: string[] = []
    if (String(row.date) > today) alerts.push('검토: 미래 날짜')
    if ((counts.get(duplicateKey(row)) ?? 0) > 1) {
      alerts.push('검토: 중복 후보')
    }
    return withReview(row, alerts)
  })
}

async function annotateSingle(row: Record<string, unknown>) {
  if (row.status === 'canceled') return withReview(row, [])

  const { data, error } = await db()
    .from('transactions')
    .select('id')
    .eq('household_id', row.household_id)
    .eq('status', 'active')
    .eq('date', row.date)
    .eq('category_major', row.category_major)
    .eq('category_minor', row.category_minor)
    .eq('amount', row.amount)
    .eq('correction', row.correction ?? 0)
    .eq('merchant', row.merchant ?? '')
    .eq('memo', row.memo ?? '')
    .neq('id', row.id)
    .limit(1)

  if (error) throw dbError(error)

  const alerts: string[] = []
  if (String(row.date) > todayKst()) alerts.push('검토: 미래 날짜')
  if (data && data.length > 0) alerts.push('검토: 중복 후보')

  return withReview(row, alerts)
}

function toApiTransaction(row: Record<string, unknown>) {
  const isSpendExcluded =
    row.category_group === '집계 제외' ||
    row.category_minor === '상품권' ||
    row.category_id === 'giftcard' ||
    (typeof row.merchant === 'string' && /문화상품권/i.test(row.merchant)) ||
    (typeof row.memo === 'string' && /문화상품권/i.test(row.memo))

  const rawNote = String(row.note ?? '')
  const linkMatch = rawNote.match(/\[linked_tx:([^\]]+)\]/)
  const linkedTransactionId = linkMatch ? linkMatch[1] : null
  const cleanNote = rawNote.replace(/\[linked_tx:[^\]]+\]\s*/g, '').trim()

  return {
    id: row.id,
    date: row.date,
    categoryMajor: row.category_major,
    categoryMinor: row.category_minor,
    category: `${row.category_major}-${row.category_minor}`,
    categoryGroup: row.category_group,
    excludeFromSpend: isSpendExcluded,
    excluded: Boolean(row.excluded),
    amount: Number(row.amount) || 0,
    correction: Number(row.correction) || 0,
    effectiveAmount: effectiveAmount(row),
    merchant: row.merchant ?? '',
    memo: row.memo ?? '',
    note: cleanNote,
    linkedTransactionId,
    paymentMethod: row.payment_method ?? null,
    cardId: row.card_id ?? null,
    status: row.status ?? 'active',
    canceledAt: row.canceled_at ?? null,
    cancelReason: row.cancel_reason ?? null,
    source: row.source ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    fixedExpenseId: row.fixed_expense_id ?? null,
    fixedExpenseMonth: row.fixed_expense_month
      ? String(row.fixed_expense_month).slice(0, 7)
      : null,
    inputStatus: row.input_status ?? '정상',
    reviewAlert: row.review_alert ?? null,
    reviewAlerts: Array.isArray(row.review_alerts) ? row.review_alerts : [],
  }
}

function rowToRaw(row: Record<string, unknown>) {
  return {
    id: row.id,
    date: row.date,
    categoryMajor: row.category_major,
    categoryMinor: row.category_minor,
    amount: Number(row.amount) || 0,
    correction: Number(row.correction) || 0,
    merchant: row.merchant ?? '',
    memo: row.memo ?? '',
    note: row.note ?? '',
    paymentMethod: row.payment_method ?? null,
    cardId: row.card_id ?? null,
  }
}

async function fetchTransaction(householdId: string, id: string) {
  const { data, error } = await db()
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .eq('id', id)
    .maybeSingle()

  if (error) throw dbError(error)
  return data as Record<string, unknown> | null
}

async function createTransaction(req: Request, householdId: string) {
  const body = await readBody(req)
  const input = validateTransactionInput(body)
  const category = await resolveCategory(input.categoryMajor, input.categoryMinor)
  const { cardId, paymentMethod } = await resolveCardAndPayment(
    householdId,
    input,
  )

  const force = Boolean(body.force || body.allowDuplicate)
  if (!force) {
    const { data: dupData } = await db()
      .from('transactions')
      .select(
        'id, date, merchant, amount, effective_amount, category_id, card_id, payment_method, created_at',
      )
      .eq('household_id', householdId)
      .eq('status', 'active')
      .eq('date', input.date)

    const duplicateCandidates = ((dupData ?? []) as Record<string, unknown>[]).filter((t) => {
      const amt = Number(t.effective_amount ?? t.amount) || 0
      if (amt !== input.amount) return false
      const existingMerchant = String(t.merchant ?? '').toLowerCase()
      const targetMerchant = input.merchant.toLowerCase()
      return (
        existingMerchant.includes(targetMerchant) ||
        targetMerchant.includes(existingMerchant) ||
        (cardId && String(t.card_id) === String(cardId))
      )
    })

    if (duplicateCandidates.length > 0) {
      throw new ApiError(
        409,
        'DUPLICATE_CANDIDATE',
        `동일한 일자(${input.date}) 및 금액(${won(input.amount)})의 거래 내역(${duplicateCandidates[0].merchant})이 이미 존재합니다. 중복 입력을 강제하려면 force: true (또는 allowDuplicate: true)를 전달해주세요.`,
        undefined,
        {
          isDuplicateCandidate: true,
          duplicateCandidates: duplicateCandidates.map((t) => ({
            id: t.id,
            date: t.date,
            merchant: t.merchant,
            amount: Number(t.effective_amount ?? t.amount),
            paymentMethod: t.payment_method,
            createdAt: t.created_at,
          })),
        },
      )
    }
  }

  const appCategory = appCategoryId(input.categoryMajor, input.categoryMinor)
  const savings = appCategory === 'savings'
  const normalizedPaymentMethod = savings
    ? ['신용카드', '체크카드', '간편결제'].includes(paymentMethod ?? '')
      ? '계좌이체'
      : paymentMethod ?? '계좌이체'
    : paymentMethod
  const usesCard = ['신용카드', '체크카드', '간편결제'].includes(
    normalizedPaymentMethod ?? '',
  )

  const isGiftCard =
    input.categoryMinor === '상품권' ||
    appCategory === 'giftcard' ||
    /문화상품권|상품권/i.test(input.merchant) ||
    /문화상품권|상품권/i.test(input.memo)

  const isSpendExcluded =
    input.excludeFromSpend !== undefined
      ? input.excludeFromSpend
      : input.categoryGroup === '집계 제외' || isGiftCard

  const effectiveCategoryGroup = isSpendExcluded
    ? '집계 제외'
    : (input.categoryGroup ?? category.category_group)

  const effectiveAppCategory = isGiftCard ? 'giftcard' : appCategory

  const effectiveExcluded =
    input.excluded !== undefined
      ? input.excluded
      : savings || (input.categoryMajor !== '생활비' && !isSpendExcluded)

  const rawLinked =
    body.linkedTransactionId || body.linked_transaction_id || body.giftCardPurchaseId
  let noteToStore = input.note || ''
  if (rawLinked && typeof rawLinked === 'string') {
    noteToStore = noteToStore ? `${noteToStore} [linked_tx:${rawLinked}]` : `[linked_tx:${rawLinked}]`
  }

  const payload = {
    household_id: householdId,
    id: input.id ?? crypto.randomUUID(),
    date: input.date,
    merchant: input.merchant,
    amount: input.amount,
    category_id: effectiveAppCategory,
    card_id: usesCard ? cardId : null,
    memo: input.memo,
    excluded: effectiveExcluded,
    category_major: input.categoryMajor,
    category_minor: input.categoryMinor,
    category_group: effectiveCategoryGroup,
    correction: input.correction,
    payment_method: normalizedPaymentMethod,
    note: noteToStore,
    status: 'active',
    source: input.source ?? 'muse',
    created_by: 'muse',
    updated_by: 'muse',
  }

  const { data, error } = await db()
    .from('transactions')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw dbError(error)

  const annotated = await annotateSingle(data as Record<string, unknown>)
  return dataResponse(toApiTransaction(annotated), 201)
}

async function listTransactions(req: Request, householdId: string) {
  const url = new URL(req.url)
  const params = url.searchParams

  let from: string | undefined
  let to: string | undefined

  const month = params.get('month')
  if (month) {
    const normalized = normalizeMonth(month)
    const range = monthRange(normalized)
    from = range.from
    to = range.to
  } else {
    const rawFrom = params.get('from')
    const rawTo = params.get('to')
    if (rawFrom) {
      if (!isDateString(rawFrom)) {
        throw new ApiError(400, 'VALIDATION_ERROR', '날짜 형식이 올바르지 않습니다.', {
          from: 'YYYY-MM-DD 형식이어야 합니다.',
        })
      }
      from = rawFrom
    }
    if (rawTo) {
      if (!isDateString(rawTo)) {
        throw new ApiError(400, 'VALIDATION_ERROR', '날짜 형식이 올바르지 않습니다.', {
          to: 'YYYY-MM-DD 형식이어야 합니다.',
        })
      }
      to = rawTo
    }
  }

  const limitRaw = Number(params.get('limit') ?? 100)
  const offsetRaw = Number(params.get('offset') ?? 0)
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500)
    : 100
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(Math.trunc(offsetRaw), 0)
    : 0

  let query: any = db()
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)

  const status = params.get('status')
  const includeCanceled = params.get('includeCanceled') === 'true'
  if (status === 'active' || status === 'canceled') {
    query = query.eq('status', status)
  } else if (!includeCanceled) {
    query = query.eq('status', 'active')
  }

  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)

  const categoryMajor = params.get('categoryMajor') ?? params.get('type')
  if (categoryMajor) query = query.eq('category_major', categoryMajor)
  const categoryMinor = params.get('categoryMinor')
  if (categoryMinor) query = query.eq('category_minor', categoryMinor)
  const categoryGroup = params.get('categoryGroup') ?? params.get('group')
  if (categoryGroup) query = query.eq('category_group', categoryGroup)

  const q = params.get('q')
  if (q && q.trim()) {
    const escaped = q.trim().replace(/[%_,]/g, '')
    query = query.or(`merchant.ilike.%${escaped}%,memo.ilike.%${escaped}%`)
  }

  const { data, error } = await query
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) throw dbError(error)

  const annotated = annotateRows((data ?? []) as Record<string, unknown>[])
  const page = annotated.slice(offset, offset + limit)

  return dataResponse(page.map(toApiTransaction), 200, {
    pagination: {
      limit,
      offset,
      total: annotated.length,
      hasMore: offset + page.length < annotated.length,
    },
  })
}

async function getTransaction(req: Request, householdId: string, id: string) {
  const row = await fetchTransaction(householdId, id)
  if (!row) throw new ApiError(404, 'NOT_FOUND', '거래를 찾을 수 없습니다.')

  const annotated = await annotateSingle(row)
  return dataResponse(toApiTransaction(annotated))
}

async function updateTransaction(
  req: Request,
  householdId: string,
  id: string,
) {
  const existing = await fetchTransaction(householdId, id)
  if (!existing) throw new ApiError(404, 'NOT_FOUND', '거래를 찾을 수 없습니다.')
  if (existing.status === 'canceled') {
    throw new ApiError(
      409,
      'CONFLICT',
      '취소된 거래는 수정할 수 없습니다. 먼저 복구해 주세요.',
    )
  }

  const body = normalizeAliases(await readBody(req))
  if (body.id !== undefined && body.id !== id) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'ID는 수정할 수 없습니다.', {
      id: '경로의 ID와 본문의 ID가 다릅니다.',
    })
  }

  const definedBody = Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  )
  const merged = { ...rowToRaw(existing), ...definedBody }
  const input = validateTransactionInput(merged)
  const category = await resolveCategory(input.categoryMajor, input.categoryMinor)
  const { cardId, paymentMethod } = await resolveCardAndPayment(
    householdId,
    input,
  )
  const appCategory = appCategoryId(input.categoryMajor, input.categoryMinor)
  const savings = appCategory === 'savings'
  const normalizedPaymentMethod = savings
    ? ['신용카드', '체크카드', '간편결제'].includes(paymentMethod ?? '')
      ? '계좌이체'
      : paymentMethod ?? '계좌이체'
    : paymentMethod
  const usesCard = ['신용카드', '체크카드', '간편결제'].includes(
    normalizedPaymentMethod ?? '',
  )

  const isGiftCard =
    input.categoryMinor === '상품권' ||
    appCategory === 'giftcard' ||
    /문화상품권|상품권/i.test(input.merchant) ||
    /문화상품권|상품권/i.test(input.memo)

  const isSpendExcluded =
    input.excludeFromSpend !== undefined
      ? input.excludeFromSpend
      : input.categoryGroup === '집계 제외' || isGiftCard

  const effectiveCategoryGroup = isSpendExcluded
    ? '집계 제외'
    : (input.categoryGroup ?? category.category_group)

  const effectiveAppCategory = isGiftCard ? 'giftcard' : appCategory

  const effectiveExcluded =
    input.excluded !== undefined
      ? input.excluded
      : savings || (input.categoryMajor !== '생활비' && !isSpendExcluded)

  const payload = {
    date: input.date,
    merchant: input.merchant,
    amount: input.amount,
    category_id: effectiveAppCategory,
    card_id: usesCard ? cardId : null,
    memo: input.memo,
    excluded: effectiveExcluded,
    category_major: input.categoryMajor,
    category_minor: input.categoryMinor,
    category_group: effectiveCategoryGroup,
    correction: input.correction,
    payment_method: normalizedPaymentMethod,
    note: input.note,
    source: input.source ?? 'muse',
    updated_by: 'muse',
  }

  const { data, error } = await db()
    .from('transactions')
    .update(payload)
    .eq('household_id', householdId)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw dbError(error)

  const annotated = await annotateSingle(data as Record<string, unknown>)
  return dataResponse(toApiTransaction(annotated))
}

async function cancelTransaction(
  req: Request,
  householdId: string,
  id: string,
) {
  const existing = await fetchTransaction(householdId, id)
  if (!existing) throw new ApiError(404, 'NOT_FOUND', '거래를 찾을 수 없습니다.')

  if (existing.status === 'canceled') {
    return dataResponse(toApiTransaction(existing))
  }

  const body = await readBody(req)
  const reasonRaw = body.reason
  if (reasonRaw !== undefined && typeof reasonRaw !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', '취소 사유가 올바르지 않습니다.', {
      reason: '문자열이어야 합니다.',
    })
  }
  const reason = (reasonRaw as string | undefined)?.trim() || 'Muse에서 취소'

  const { data, error } = await db()
    .from('transactions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      cancel_reason: reason,
      source: 'muse',
      updated_by: 'muse',
    })
    .eq('household_id', householdId)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw dbError(error)

  return dataResponse(toApiTransaction(data as Record<string, unknown>))
}

async function restoreTransaction(householdId: string, id: string) {
  const existing = await fetchTransaction(householdId, id)
  if (!existing) throw new ApiError(404, 'NOT_FOUND', '거래를 찾을 수 없습니다.')

  if (existing.status === 'active') {
    const annotated = await annotateSingle(existing)
    return dataResponse(toApiTransaction(annotated))
  }

  const { data, error } = await db()
    .from('transactions')
    .update({
      status: 'active',
      canceled_at: null,
      cancel_reason: null,
      source: 'muse',
      updated_by: 'muse',
    })
    .eq('household_id', householdId)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw dbError(error)

  const annotated = await annotateSingle(data as Record<string, unknown>)
  return dataResponse(toApiTransaction(annotated))
}

async function transactionHistory(householdId: string, id: string) {
  const existing = await fetchTransaction(householdId, id)
  if (!existing) throw new ApiError(404, 'NOT_FOUND', '거래를 찾을 수 없습니다.')

  const { data, error } = await db()
    .from('ledger_history')
    .select('id, action, before_data, after_data, changed_by, created_at')
    .eq('household_id', householdId)
    .eq('entity_type', 'transaction')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })

  if (error) throw dbError(error)

  return dataResponse(data ?? [])
}

function balanceValues(row: Record<string, unknown>) {
  return {
    cashAccount: row.cash_account ?? null,
    securitiesKrw: row.securities_krw ?? null,
    foreignCashKrw: row.foreign_cash_krw ?? null,
    overdraftUsed: row.overdraft_used ?? null,
    familyLoan: row.family_loan ?? null,
    otherLoan: row.other_loan ?? null,
  }
}

function balanceStatus(values: Record<string, unknown>) {
  const filled = BALANCE_KEYS.filter((key) => typeof values[key] === 'number').length
  if (filled === 0) return { filled, complete: false, inputStatus: '미입력' }
  if (filled === 6) return { filled, complete: true, inputStatus: '입력완료' }
  return { filled, complete: false, inputStatus: '잔액 6칸 입력' }
}

function balanceTotals(values: Record<string, unknown>) {
  const status = balanceStatus(values)
  if (!status.complete) {
    return { ...status, cashTotal: null, debtTotal: null }
  }

  return {
    ...status,
    cashTotal:
      Number(values.cashAccount) +
      Number(values.securitiesKrw) +
      Number(values.foreignCashKrw),
    debtTotal:
      Number(values.overdraftUsed) +
      Number(values.familyLoan) +
      Number(values.otherLoan),
  }
}

function toApiBalance(
  row: Record<string, unknown>,
  previous?: Record<string, unknown> | null,
) {
  const values = balanceValues(row)
  const current = balanceTotals(values)
  const previousValues = previous ? balanceValues(previous) : null
  const previousTotals = previousValues ? balanceTotals(previousValues) : null

  const cashDelta =
    current.cashTotal !== null &&
    previousTotals !== null &&
    previousTotals?.cashTotal !== null
      ? current.cashTotal - (previousTotals?.cashTotal as number)
      : null
  const debtDelta =
    current.debtTotal !== null &&
    previousTotals !== null &&
    previousTotals?.debtTotal !== null
      ? current.debtTotal - (previousTotals?.debtTotal as number)
      : null

  return {
    month: String(row.month).slice(0, 7),
    ...values,
    sheet: {
      B: values.cashAccount,
      C: values.securitiesKrw,
      D: values.foreignCashKrw,
      E: values.overdraftUsed,
      F: values.familyLoan,
      G: values.otherLoan,
    },
    cashTotal: current.cashTotal,
    debtTotal: current.debtTotal,
    cashDelta,
    debtDelta,
    inputStatus: current.inputStatus,
    filledCount: current.filled,
    memo: row.memo ?? '',
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  }
}

async function balanceRows(householdId: string) {
  const { data, error } = await db()
    .from('balance_snapshots')
    .select('*')
    .eq('household_id', householdId)
    .order('month', { ascending: true })

  if (error) throw dbError(error)
  return (data ?? []) as Record<string, unknown>[]
}

async function listBalances(req: Request, householdId: string) {
  const params = new URL(req.url).searchParams
  const month = params.get('month')
  const from = params.get('from')
  const to = params.get('to')

  const rows = await balanceRows(householdId)

  let filtered = rows
  if (month) {
    const normalized = normalizeMonth(month)
    filtered = rows.filter((row) => String(row.month).startsWith(normalized))
  } else {
    if (from && /^\d{4}-\d{2}$/.test(from)) {
      filtered = filtered.filter((row) => String(row.month).slice(0, 7) >= from)
    }
    if (to && /^\d{4}-\d{2}$/.test(to)) {
      filtered = filtered.filter((row) => String(row.month).slice(0, 7) <= to)
    }
  }

  const result = filtered.map((row) => {
    const index = rows.findIndex((candidate) => candidate.month === row.month)
    return toApiBalance(row, index > 0 ? rows[index - 1] : null)
  })

  return dataResponse(result)
}

async function getBalance(householdId: string, monthInput: string) {
  const month = normalizeMonth(monthInput)
  const rows = await balanceRows(householdId)
  const index = rows.findIndex((row) => String(row.month).startsWith(month))

  if (index < 0) {
    throw new ApiError(404, 'NOT_FOUND', '해당 월의 잔액 스냅샷이 없습니다.')
  }

  return dataResponse(
    toApiBalance(rows[index], index > 0 ? rows[index - 1] : null),
  )
}

function readBalanceValue(
  body: Record<string, unknown>,
  columns: Record<string, unknown> | null,
  key: string,
  sheet: string,
  fields: Record<string, string>,
) {
  const raw =
    body[key] ??
    body[key.toLowerCase()] ??
    body[sheet] ??
    body[sheet.toLowerCase()] ??
    columns?.[sheet] ??
    columns?.[sheet.toLowerCase()]

  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    fields[key] = '정수 또는 null이어야 합니다.'
    return null
  }
  return raw
}

async function putBalance(
  req: Request,
  householdId: string,
  monthInput: string,
) {
  const month = normalizeMonth(monthInput)
  const body = await readBody(req)
  const columns =
    body.columns && typeof body.columns === 'object' && !Array.isArray(body.columns)
      ? (body.columns as Record<string, unknown>)
      : null

  const fields: Record<string, string> = {}
  const values: Record<string, number | null> = {}

  for (const column of BALANCE_COLUMNS) {
    values[column.key] = readBalanceValue(
      body,
      columns,
      column.key,
      column.sheet,
      fields,
    )
  }

  const memo = body.memo === undefined || body.memo === null ? '' : body.memo
  if (typeof memo !== 'string') {
    fields.memo = '문자열이어야 합니다.'
  } else if (memo.length > 500) {
    fields.memo = '500자 이하여야 합니다.'
  }

  if (Object.keys(fields).length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', '입력값을 확인해 주세요.', fields)
  }

  const monthDate = `${month}-01`
  const existing = await db()
    .from('balance_snapshots')
    .select('month')
    .eq('household_id', householdId)
    .eq('month', monthDate)
    .maybeSingle()

  if (existing.error) throw dbError(existing.error)

  const payload = {
    household_id: householdId,
    month: monthDate,
    cash_account: values.cashAccount,
    securities_krw: values.securitiesKrw,
    foreign_cash_krw: values.foreignCashKrw,
    overdraft_used: values.overdraftUsed,
    family_loan: values.familyLoan,
    other_loan: values.otherLoan,
    memo: memo as string,
    updated_by: 'muse',
  }

  const operation = existing.data
    ? db()
        .from('balance_snapshots')
        .update(payload)
        .eq('household_id', householdId)
        .eq('month', monthDate)
    : db()
        .from('balance_snapshots')
        .insert({ ...payload, created_by: 'muse' })

  const { error } = await operation
  if (error) throw dbError(error)

  return getBalance(householdId, month)
}

async function monthlyAggregate(householdId: string, monthInput: string) {
  const month = normalizeMonth(monthInput)
  const range = monthRange(month)
  const monthDate = `${month}-01`

  // SQL RPC: DB 엔진에서 그룹별·분류별 사전 집계하여 가져옴 (5,000건 원본 행 전송 제거)
  const { data: summaryRows, error: summaryError } = await db()
    .rpc('get_monthly_category_summary', {
      p_household_id: householdId,
      p_month: monthDate,
    })

  if (summaryError) throw dbError(summaryError)

  const byType: Record<string, number> = Object.fromEntries(
    TRANSACTION_TYPES.map((type) => [type, 0]),
  )
  const byGroup: Record<string, number> = {
    수입: 0,
    생활비: 0,
    투자납입: 0,
    투자회수: 0,
    대출차입: 0,
    대출상환: 0,
    '집계 제외': 0,
  }
  const categoryMap = new Map<
    string,
    {
      categoryMajor: string
      categoryMinor: string
      categoryGroup: string
      amount: number
      count: number
    }
  >()

  let totalTransactionCount = 0

  for (const row of (summaryRows ?? []) as Array<{
    category_group: string
    category_major: string
    category_minor: string
    total_amount: number | string
    transaction_count: number | string
  }>) {
    const amount = Number(row.total_amount) || 0
    const count = Number(row.transaction_count) || 0
    const major = String(row.category_major || '생활비')
    const minor = String(row.category_minor || '기타')
    const group = String(row.category_group || '생활비')

    totalTransactionCount += count
    byGroup[group] = (byGroup[group] ?? 0) + amount
    if (group !== '집계 제외' || major === '계좌이체') {
      byType[major] = (byType[major] ?? 0) + amount
    }

    const key = `${major}|${minor}|${group}`
    const current = categoryMap.get(key) ?? {
      categoryMajor: major,
      categoryMinor: minor,
      categoryGroup: group,
      amount: 0,
      count: 0,
    }
    current.amount += amount
    current.count += count
    categoryMap.set(key, current)
  }

  const byCategory = Array.from(categoryMap.values()).sort(
    (a, b) => b.amount - a.amount,
  )
  const topExpenses = byCategory
    .filter((row) => row.categoryGroup === '생활비')
    .slice(0, 10)

  const income = byGroup['수입'] ?? 0
  const livingExpense = byGroup['생활비'] ?? 0
  const excludedFromSpend = byGroup['집계 제외'] ?? 0
  const livingSurplus = income - livingExpense
  const investmentContribution = byGroup['투자납입'] ?? 0
  const investmentWithdrawal = byGroup['투자회수'] ?? 0
  const loanBorrowing = byGroup['대출차입'] ?? 0
  const principalRepayment = byGroup['대출상환'] ?? 0
  const distributionBalance =
    livingSurplus -
    investmentContribution +
    investmentWithdrawal +
    loanBorrowing -
    principalRepayment

  // 검토 대상(미래 날짜 등) 경량 카운트 (행 전송 없이 HEAD 집계)
  const today = todayKst()
  const { count: futureCount, error: countError } = await db()
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .eq('status', 'active')
    .gte('date', range.from)
    .lte('date', range.to)
    .gt('date', today)

  if (countError) throw dbError(countError)
  const reviewCount = futureCount ?? 0

  const balanceRowsAll = await balanceRows(householdId)
  const balanceIndex = balanceRowsAll.findIndex((row) =>
    String(row.month).startsWith(month),
  )
  const balance =
    balanceIndex >= 0
      ? toApiBalance(
          balanceRowsAll[balanceIndex],
          balanceIndex > 0 ? balanceRowsAll[balanceIndex - 1] : null,
        )
      : null

  return {
    month,
    income,
    livingExpense,
    excludedFromSpend,
    livingSurplus,
    investmentContribution,
    investmentWithdrawal,
    loanBorrowing,
    principalRepayment,
    distributionBalance,
    transactionCount: totalTransactionCount,
    reviewCount,
    byGroup,
    byType,
    byCategory,
    topExpenses,
    balance,
  }
}

interface NormalizedFixedExpense {
  name: string
  amount: number
  dayOfMonth: number
  categoryMajor: string
  categoryMinor: string
  categoryId: string | null
  cardId: string | null
  paymentMethod: string | null
  memo: string
  note: string
  startMonth: string | null
  endMonth: string | null
  active: boolean
}

function fixedDayLabel(day: number): string {
  return day >= 31 ? '말일' : `${day}일`
}

function fixedExpenseToRaw(row: Record<string, unknown>) {
  return {
    name: row.merchant ?? '',
    amount: Number(row.amount) || 0,
    dayOfMonth: Number(row.day_of_month) || 1,
    categoryMajor: row.category_major ?? '생활비',
    categoryMinor: row.category_minor ?? '기타',
    categoryId: row.category_id ?? null,
    cardId: row.card_id ?? null,
    paymentMethod: row.payment_method ?? null,
    memo: row.memo ?? '',
    note: row.note ?? '',
    startMonth: row.start_month
      ? String(row.start_month).slice(0, 7)
      : null,
    endMonth: row.end_month ? String(row.end_month).slice(0, 7) : null,
    active: row.active !== false,
  }
}

function validateFixedExpenseInput(
  raw: Record<string, unknown>,
): NormalizedFixedExpense {
  const name = String(raw.name ?? raw.merchant ?? '').trim()
  if (!name) {
    throw new ApiError(400, 'VALIDATION_ERROR', '고정지출 이름을 입력해 주세요.', {
      name: '필수',
    })
  }

  const amount = Number(raw.amount)
  if (!Number.isInteger(amount) || amount < 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', '금액은 0 이상의 정수여야 합니다.', {
      amount: '0 이상의 정수',
    })
  }

  const dayRaw = raw.dayOfMonth ?? raw.day ?? 1
  const dayOfMonth =
    dayRaw === 'last' || dayRaw === '말일'
      ? 31
      : Number(dayRaw)
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new ApiError(400, 'VALIDATION_ERROR', '반영일은 1~31 사이여야 합니다.', {
      dayOfMonth: '1~31 (31=말일)',
    })
  }

  const categoryMajor = String(raw.categoryMajor ?? '생활비').trim()
  const categoryMinor = String(raw.categoryMinor ?? '기타').trim()
  if (!TRANSACTION_TYPES.includes(categoryMajor as (typeof TRANSACTION_TYPES)[number])) {
    throw new ApiError(400, 'VALIDATION_ERROR', '거래유형이 올바르지 않습니다.', {
      categoryMajor: TRANSACTION_TYPES.join(', '),
    })
  }
  if (!categoryMinor) {
    throw new ApiError(400, 'VALIDATION_ERROR', '분류 소분류를 입력해 주세요.', {
      categoryMinor: '필수',
    })
  }

  const startMonthRaw = raw.startMonth
  const endMonthRaw = raw.endMonth
  const startMonth =
    startMonthRaw === undefined || startMonthRaw === null || startMonthRaw === ''
      ? null
      : normalizeMonth(String(startMonthRaw), 'startMonth')
  const endMonth =
    endMonthRaw === undefined || endMonthRaw === null || endMonthRaw === ''
      ? null
      : normalizeMonth(String(endMonthRaw), 'endMonth')
  if (startMonth && endMonth && startMonth > endMonth) {
    throw new ApiError(400, 'VALIDATION_ERROR', '시작월은 종료월보다 늦을 수 없습니다.')
  }

  return {
    name,
    amount,
    dayOfMonth,
    categoryMajor,
    categoryMinor,
    categoryId: raw.categoryId == null ? null : String(raw.categoryId),
    cardId: raw.cardId == null ? null : String(raw.cardId),
    paymentMethod:
      raw.paymentMethod == null ? null : String(raw.paymentMethod),
    memo: raw.memo == null ? '' : String(raw.memo),
    note: raw.note == null ? '' : String(raw.note),
    startMonth,
    endMonth,
    active: raw.active === undefined ? true : Boolean(raw.active),
  }
}

async function resolveFixedExpenseCard(
  householdId: string,
  input: NormalizedFixedExpense,
) {
  let cardId = input.cardId
  let paymentMethod = input.paymentMethod

  if (
    paymentMethod &&
    !PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number])
  ) {
    const card = await findCard(householdId, paymentMethod, 'paymentMethod')
    cardId = card?.id ?? cardId
    paymentMethod = card
      ? card.kind === 'check'
        ? '체크카드'
        : '신용카드'
      : paymentMethod
  }

  const card = cardId
    ? await findCard(householdId, cardId, 'cardId')
    : null
  return { cardId: card?.id ?? null, paymentMethod }
}

async function buildFixedExpensePayload(
  householdId: string,
  input: NormalizedFixedExpense,
) {
  const category = await resolveCategory(
    input.categoryMajor,
    input.categoryMinor,
  )
  const { cardId, paymentMethod } = await resolveFixedExpenseCard(
    householdId,
    input,
  )
  const savings =
    input.categoryMajor === '투자납입' || input.categoryId === 'savings'
  const normalizedPaymentMethod = savings
    ? ['신용카드', '체크카드', '간편결제'].includes(paymentMethod ?? '')
      ? '자동이체'
      : paymentMethod ?? '자동이체'
    : paymentMethod
  const usesCard = ['신용카드', '체크카드', '간편결제'].includes(
    normalizedPaymentMethod ?? '',
  )

  let noteToSave = input.note || ''
  if ((input as Record<string, unknown>).isVariable) {
    if (!/\[variable\]/i.test(noteToSave)) {
      noteToSave = noteToSave ? `[variable] ${noteToSave}` : '[variable]'
    }
  }

  return {
    household_id: householdId,
    active: input.active,
    start_month: input.startMonth ? `${input.startMonth}-01` : null,
    end_month: input.endMonth ? `${input.endMonth}-01` : null,
    day_of_month: input.dayOfMonth,
    category_major: savings ? '투자납입' : input.categoryMajor,
    category_minor: savings ? '예적금' : input.categoryMinor,
    category_group: savings ? '투자납입' : category.category_group,
    category_id: savings
      ? 'savings'
      : input.categoryId ||
        appCategoryId(input.categoryMajor, input.categoryMinor),
    amount: input.amount,
    merchant: input.name,
    memo: input.memo || null,
    payment_method: normalizedPaymentMethod,
    note: noteToSave || null,
    card_id: usesCard ? cardId : null,
    updated_by: 'muse',
  }
}

function toApiFixedExpense(row: Record<string, unknown>) {
  const dayOfMonth = Number(row.day_of_month) || 1
  const rawNote = String(row.note ?? '')
  const isVariable = /\[variable\]/i.test(rawNote)
  const cleanNote = rawNote.replace(/\[variable\]\s*/gi, '').trim()
  return {
    id: row.id,
    active: Boolean(row.active),
    name: row.merchant ?? '',
    amount: Number(row.amount) || 0,
    isVariable,
    dayOfMonth,
    dayLabel: fixedDayLabel(dayOfMonth),
    categoryMajor: row.category_major ?? '생활비',
    categoryMinor: row.category_minor ?? '기타',
    categoryGroup: row.category_group ?? '생활비',
    categoryId:
      row.category_id ??
      appCategoryId(
        String(row.category_major ?? '생활비'),
        String(row.category_minor ?? '기타'),
      ),
    cardId: row.card_id ?? null,
    paymentMethod: row.payment_method ?? null,
    memo: row.memo ?? '',
    note: cleanNote,
    startMonth: row.start_month ? String(row.start_month).slice(0, 7) : null,
    endMonth: row.end_month ? String(row.end_month).slice(0, 7) : null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  }
}

async function fetchFixedExpense(householdId: string, id: string) {
  if (!UUID_RE.test(id)) {
    throw new ApiError(400, 'VALIDATION_ERROR', '고정지출 ID가 올바르지 않습니다.')
  }
  const { data, error } = await db()
    .from('recurring_expenses')
    .select('*')
    .eq('household_id', householdId)
    .eq('id', id)
    .maybeSingle()

  if (error) throw dbError(error)
  if (!data) {
    throw new ApiError(404, 'NOT_FOUND', '고정지출을 찾을 수 없습니다.')
  }
  return data as Record<string, unknown>
}

async function createFixedExpense(req: Request, householdId: string) {
  const body = normalizeAliases(await readBody(req))
  const input = validateFixedExpenseInput(body)
  const payload = await buildFixedExpensePayload(householdId, input)
  const id = crypto.randomUUID()

  const { data, error } = await db()
    .from('recurring_expenses')
    .insert({ ...payload, id, created_by: 'muse' })
    .select('*')
    .single()

  if (error) throw dbError(error)
  return dataResponse(toApiFixedExpense(data as Record<string, unknown>), 201)
}

async function updateFixedExpense(
  req: Request,
  householdId: string,
  id: string,
) {
  const existing = await fetchFixedExpense(householdId, id)
  const body = normalizeAliases(await readBody(req))
  const input = validateFixedExpenseInput({
    ...fixedExpenseToRaw(existing),
    ...body,
  })
  const payload = await buildFixedExpensePayload(householdId, input)

  const { data, error } = await db()
    .from('recurring_expenses')
    .update(payload)
    .eq('household_id', householdId)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw dbError(error)
  return dataResponse(toApiFixedExpense(data as Record<string, unknown>))
}

async function deleteFixedExpense(householdId: string, id: string) {
  await fetchFixedExpense(householdId, id)
  const { data, error } = await db()
    .from('recurring_expenses')
    .update({ active: false, updated_by: 'muse' })
    .eq('household_id', householdId)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw dbError(error)
  return dataResponse(toApiFixedExpense(data as Record<string, unknown>))
}

async function fixedExpenseHistory(householdId: string, id: string) {
  await fetchFixedExpense(householdId, id)
  const { data, error } = await db()
    .from('ledger_history')
    .select('*')
    .eq('household_id', householdId)
    .eq('entity_type', 'recurring_expense')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })

  if (error) throw dbError(error)
  return dataResponse(data ?? [])
}

function fixedCandidateDate(
  row: Record<string, unknown>,
  month: string,
  lastDay: number,
) {
  const day = Number(row.day_of_month)
  if (!Number.isInteger(day) || day < 1) return null
  const actualDay = day >= 31 ? lastDay : Math.min(day, lastDay)
  return `${month}-${String(actualDay).padStart(2, '0')}`
}

async function fixedExpenses(
  householdId: string,
  monthInput: string,
  includeInactive = false,
) {
  const month = normalizeMonth(monthInput)
  const range = monthRange(month)
  const monthDate = `${month}-01`

  const { data: recurringData, error: recurringError } = await db()
    .from('recurring_expenses')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: true })

  if (recurringError) throw dbError(recurringError)

  const { data: transactionData, error: transactionError } = await db()
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .eq('status', 'active')
    .gte('date', range.from)
    .lte('date', range.to)

  if (transactionError) throw dbError(transactionError)

  const { data: linkedData, error: linkedError } = await db()
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .eq('status', 'active')
    .eq('fixed_expense_month', monthDate)

  if (linkedError) throw dbError(linkedError)

  const transactionMap = new Map<string, Record<string, unknown>>()
  for (const transaction of [
    ...((transactionData ?? []) as Record<string, unknown>[]),
    ...((linkedData ?? []) as Record<string, unknown>[]),
  ]) {
    transactionMap.set(String(transaction.id), transaction)
  }
  const transactions = [...transactionMap.values()]
  const linkedByFixedExpense = new Map<string, Record<string, unknown>>()
  for (const transaction of transactions) {
    if (!transaction.fixed_expense_id) continue
    const fixedMonth = transaction.fixed_expense_month
      ? String(transaction.fixed_expense_month).slice(0, 7)
      : month
    const key = `${transaction.fixed_expense_id}:${fixedMonth}`
    if (!linkedByFixedExpense.has(key)) {
      linkedByFixedExpense.set(key, transaction)
    }
  }

  const today = todayKst()
  const items = ((recurringData ?? []) as Record<string, unknown>[])
    .filter((row) => {
      if (!includeInactive && !row.active) return false
      const start = row.start_month ? String(row.start_month).slice(0, 7) : null
      const end = row.end_month ? String(row.end_month).slice(0, 7) : null
      if (start && month < start) return false
      if (end && month > end) return false
      return true
    })
    .map((row) => {
      const base = toApiFixedExpense(row)
      const candidateDate = fixedCandidateDate(
        row,
        month,
        range.lastDay,
      )
      const linked = linkedByFixedExpense.get(`${row.id}:${month}`)
      // 매칭은 fixed_expense_id + fixed_expense_month로만 인정한다.
      // 같은 날짜·금액이어도 연결되지 않은 거래는 자동 매칭하지 않고 후보로만 알려준다.
      const matched = linked
      const rowNote = String(row.note ?? '')
      const isVariable = /\[variable\]/i.test(rowNote)
      const suggestedCandidates = !matched && candidateDate
        ? transactions
            .filter((transaction) => {
              if (transaction.fixed_expense_id) return false
              const txAmt = effectiveAmount(transaction)
              const rowAmt = Number(row.amount)
              const txDate = String(transaction.date ?? '')

              // 1. 정확한 날짜 + 정확한 금액
              if (txDate === candidateDate && txAmt === rowAmt) return true

              // 2. 변동 정기지출(isVariable) 또는 카드/가맹점 매칭 (±4일 오차 범위)
              const targetMerchant = String(row.merchant ?? '').toLowerCase()
              const txMerchant = String(transaction.merchant ?? '').toLowerCase()
              const merchantMatches =
                targetMerchant &&
                (txMerchant.includes(targetMerchant) || targetMerchant.includes(txMerchant))
              const cardMatches = row.card_id && String(transaction.card_id) === String(row.card_id)

              if (merchantMatches || (cardMatches && isVariable)) {
                const diffDays = Math.abs(
                  (new Date(txDate).getTime() - new Date(candidateDate).getTime()) /
                    (1000 * 60 * 60 * 24),
                )
                if (diffDays <= 4) {
                  if (isVariable) {
                    return txAmt > 0 && Math.abs(txAmt - rowAmt) / Math.max(1, rowAmt) <= 0.35
                  }
                  if (txAmt === rowAmt) return true
                }
              }

              return false
            })
            .slice(0, 5)
            .map((transaction) => ({
              id: transaction.id,
              date: transaction.date,
              merchant: transaction.merchant ?? '',
              amount: effectiveAmount(transaction),
              categoryMajor: transaction.category_major ?? null,
              categoryMinor: transaction.category_minor ?? null,
              linkHint:
                '이 거래를 고정지출에 연결하려면 apply에 linkTransactionId로 지정하세요.',
            }))
        : []
      let candidateStatus = '기간·일자 확인'
      if (candidateDate) {
        if (matched) candidateStatus = '기록됨'
        else if (candidateDate > today) candidateStatus = '예정'
        else candidateStatus = '반영 후보'
      }

      return {
        ...base,
        definitionId: base.id,
        date: candidateDate,
        candidateDate: matched
          ? String(matched.date)
          : candidateDate,
        candidateStatus,
        candidateTransactionId: matched?.id ?? null,
        matchedTransactionId: matched?.id ?? null,
        suggestedCandidates,
        fixedExpenseMonth: matched?.fixed_expense_month
          ? String(matched.fixed_expense_month).slice(0, 7)
          : null,
      }
    })

  return {
    month,
    total: items
      .filter((item) => item.active)
      .reduce((sum, item) => sum + item.amount, 0),
    count: items.length,
    items,
  }
}

async function applyFixedExpense(
  req: Request,
  householdId: string,
  id: string,
) {
  const existingFixed = await fetchFixedExpense(householdId, id)
  if (!existingFixed.active) {
    throw new ApiError(409, 'CONFLICT', '비활성화된 고정지출에는 반영할 수 없습니다.')
  }

  const body = normalizeAliases(await readBody(req))
  const requestedMonth =
    body.month === undefined || body.month === null || body.month === ''
      ? null
      : normalizeMonth(String(body.month))

  let date: string
  if (body.date !== undefined && body.date !== null && body.date !== '') {
    if (!isDateString(String(body.date))) {
      throw new ApiError(400, 'VALIDATION_ERROR', '날짜 형식이 올바르지 않습니다.', {
        date: 'YYYY-MM-DD',
      })
    }
    date = String(body.date)
    const dateMonth = date.slice(0, 7)
    if (requestedMonth && requestedMonth !== dateMonth) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'month와 date의 월이 일치하지 않습니다.',
      )
    }
  } else {
    const month = requestedMonth ?? todayKst().slice(0, 7)
    const lastDay = monthRange(month).lastDay
    date = fixedCandidateDate(existingFixed, month, lastDay) as string
  }

  const month = date.slice(0, 7)
  const startMonth = existingFixed.start_month
    ? String(existingFixed.start_month).slice(0, 7)
    : null
  const endMonth = existingFixed.end_month
    ? String(existingFixed.end_month).slice(0, 7)
    : null
  if (startMonth && month < startMonth) {
    throw new ApiError(400, 'VALIDATION_ERROR', '시작월보다 이전 달에는 반영할 수 없습니다.')
  }
  if (endMonth && month > endMonth) {
    throw new ApiError(400, 'VALIDATION_ERROR', '종료월보다 이후 달에는 반영할 수 없습니다.')
  }

  const { data: existingRows, error: existingError } = await db()
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .eq('fixed_expense_id', id)
    .eq('status', 'active')

  if (existingError) throw dbError(existingError)

  // fixed_expense_month가 비어 있는 예전 행은 거래 날짜의 월로 보정해 매칭한다.
  const existingLinked = ((existingRows ?? []) as Record<string, unknown>[]).find(
    (row) => {
      const linkedMonth = row.fixed_expense_month
        ? String(row.fixed_expense_month).slice(0, 7)
        : String(row.date ?? '').slice(0, 7)
      return linkedMonth === month
    },
  )

  if (existingLinked) {
    const existing = existingLinked
    const hasOverride =
      body.date !== undefined ||
      body.amount !== undefined ||
      body.merchant !== undefined ||
      body.memo !== undefined ||
      body.note !== undefined ||
      body.cardId !== undefined ||
      body.paymentMethod !== undefined

    if (!hasOverride) {
      return dataResponse({
        ...toApiTransaction(existing),
        created: false,
      })
    }

    const mergedInput = normalizeAliases({
      ...rowToRaw(existing),
      date,
      amount: body.amount ?? existing.amount,
      merchant: body.merchant ?? existing.merchant,
      memo: body.memo ?? existing.memo,
      note: body.note ?? existing.note,
      cardId: body.cardId !== undefined ? body.cardId : existing.card_id,
      paymentMethod:
        body.paymentMethod !== undefined
          ? body.paymentMethod
          : existing.payment_method,
    })
    const input = validateTransactionInput(mergedInput)
    const category = await resolveCategory(
      input.categoryMajor,
      input.categoryMinor,
    )
    const card = await resolveCardAndPayment(householdId, input)
    const appCategory = appCategoryId(input.categoryMajor, input.categoryMinor)
    const savings = appCategory === 'savings'
    const normalizedPaymentMethod = savings
      ? ['신용카드', '체크카드', '간편결제'].includes(card.paymentMethod ?? '')
        ? '계좌이체'
        : card.paymentMethod ?? '계좌이체'
      : card.paymentMethod
    const usesCard = ['신용카드', '체크카드', '간편결제'].includes(
      normalizedPaymentMethod ?? '',
    )
    const { data, error } = await db()
      .from('transactions')
      .update({
        date: input.date,
        merchant: input.merchant,
        amount: input.amount,
        category_id: appCategory,
        card_id: usesCard ? card.cardId : null,
        memo: input.memo,
        note: input.note,
        excluded: savings || input.categoryMajor !== '생활비',
        payment_method: normalizedPaymentMethod,
        category_group: category.category_group,
        fixed_expense_month: `${month}-01`,
        source: 'muse',
        updated_by: 'muse',
      })
      .eq('household_id', householdId)
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw dbError(error)
    return dataResponse({
      ...toApiTransaction(data as Record<string, unknown>),
      created: false,
    })
  }

  // 사용자가 확인한 기존 거래에 연결한다. 기존 거래를 취소하거나 새로 만들지 않는다.
  const linkTransactionId =
    body.linkTransactionId !== undefined && body.linkTransactionId !== null
      ? String(body.linkTransactionId)
      : null
  if (linkTransactionId) {
    const candidate = await fetchTransaction(householdId, linkTransactionId)
    if (!candidate) {
      throw new ApiError(404, 'NOT_FOUND', '연결할 거래를 찾을 수 없습니다.')
    }
    if (candidate.status === 'canceled') {
      throw new ApiError(409, 'CONFLICT', '취소된 거래에는 연결할 수 없습니다.')
    }
    if (candidate.fixed_expense_id) {
      throw new ApiError(
        409,
        'CONFLICT',
        '이미 다른 고정지출에 연결된 거래입니다.',
      )
    }

    const candidateMonth = String(candidate.date ?? '').slice(0, 7)
    if (candidateMonth !== month) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        '연결할 거래의 날짜가 대상 월과 다릅니다.',
        { linkTransactionId: `${candidateMonth} 거래는 ${month}에 연결할 수 없습니다.` },
      )
    }

    const { data, error } = await db()
      .from('transactions')
      .update({
        fixed_expense_id: id,
        fixed_expense_month: `${month}-01`,
        updated_by: 'muse',
      })
      .eq('household_id', householdId)
      .eq('id', linkTransactionId)
      .eq('status', 'active')
      .is('fixed_expense_id', null)
      .select('*')
      .maybeSingle()

    if (error) throw dbError(error)
    if (!data) {
      throw new ApiError(
        409,
        'CONFLICT',
        '연결할 수 있는 거래가 없습니다. 이미 연결되었거나 취소되었을 수 있습니다.',
      )
    }
    return dataResponse({
      ...toApiTransaction(data as Record<string, unknown>),
      created: false,
      linked: true,
    })
  }

  const amount = Number(body.amount ?? existingFixed.amount)
  if (!Number.isInteger(amount) || amount < 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', '금액은 0 이상의 정수여야 합니다.')
  }

  const templateInput = {
    date,
    merchant: String(body.merchant ?? existingFixed.merchant ?? existingFixed.name ?? ''),
    amount,
    categoryMajor: String(existingFixed.category_major ?? '생활비'),
    categoryMinor: String(existingFixed.category_minor ?? '기타'),
    correction: 0,
    memo: String(body.memo ?? existingFixed.memo ?? ''),
    note: String(body.note ?? existingFixed.note ?? ''),
    paymentMethod:
      body.paymentMethod !== undefined
        ? body.paymentMethod
        : existingFixed.payment_method,
    cardId:
      body.cardId !== undefined ? body.cardId : existingFixed.card_id,
  }
  const input = validateTransactionInput(templateInput)
  const category = await resolveCategory(
    input.categoryMajor,
    input.categoryMinor,
  )
  const card = await resolveCardAndPayment(householdId, input)
  const appCategory = appCategoryId(input.categoryMajor, input.categoryMinor)
  const savings = appCategory === 'savings'
  const normalizedPaymentMethod = savings
    ? ['신용카드', '체크카드', '간편결제'].includes(card.paymentMethod ?? '')
      ? '계좌이체'
      : card.paymentMethod ?? '계좌이체'
    : card.paymentMethod
  const usesCard = ['신용카드', '체크카드', '간편결제'].includes(
    normalizedPaymentMethod ?? '',
  )

  const { data, error } = await db()
    .from('transactions')
    .insert({
      household_id: householdId,
      id: crypto.randomUUID(),
      date: input.date,
      merchant: input.merchant,
      amount: input.amount,
      category_id: savings
        ? 'savings'
        : existingFixed.category_id ?? appCategoryId(input.categoryMajor, input.categoryMinor),
      card_id: usesCard ? card.cardId : null,
      memo: input.memo,
      excluded: savings || input.categoryMajor !== '생활비',
      category_major: input.categoryMajor,
      category_minor: input.categoryMinor,
      category_group: category.category_group,
      correction: 0,
      payment_method: normalizedPaymentMethod,
      note: input.note,
      status: 'active',
      fixed_expense_id: id,
      fixed_expense_month: `${month}-01`,
      source: 'muse',
      created_by: 'muse',
      updated_by: 'muse',
    })
    .select('*')
    .single()

  if (error) throw dbError(error)
  return dataResponse(
    {
      ...toApiTransaction(data as Record<string, unknown>),
      created: true,
    },
    201,
  )
}

async function getHouseholdSettings(householdId: string): Promise<{
  rawSettings: Record<string, unknown>
  settings: {
    monthlyBudget: number
    monthlyIncome: number
    monthlyGoal: number
    categoryBudgets: Record<string, number>
  }
}> {
  const { data, error } = await db()
    .from('households')
    .select('settings')
    .eq('id', householdId)
    .single()

  if (error) throw dbError(error)

  const rawSettings =
    data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
      ? (data.settings as Record<string, unknown>)
      : {}

  const rawCategoryBudgets =
    rawSettings.categoryBudgets &&
    typeof rawSettings.categoryBudgets === 'object' &&
    !Array.isArray(rawSettings.categoryBudgets)
      ? (rawSettings.categoryBudgets as Record<string, unknown>)
      : {}

  const categoryBudgets: Record<string, number> = {}
  for (const cat of APP_SPENDING_CATEGORIES) {
    const val = rawCategoryBudgets[cat.id]
    categoryBudgets[cat.id] =
      typeof val === 'number' && Number.isFinite(val) && val >= 0
        ? Math.round(val)
        : (DEFAULT_SETTINGS.categoryBudgets[
            cat.id as keyof typeof DEFAULT_SETTINGS.categoryBudgets
          ] ?? 0)
  }

  const settings = {
    monthlyBudget:
      typeof rawSettings.monthlyBudget === 'number' &&
      Number.isFinite(rawSettings.monthlyBudget) &&
      rawSettings.monthlyBudget >= 0
        ? Math.round(rawSettings.monthlyBudget)
        : DEFAULT_SETTINGS.monthlyBudget,
    monthlyIncome:
      typeof rawSettings.monthlyIncome === 'number' &&
      Number.isFinite(rawSettings.monthlyIncome) &&
      rawSettings.monthlyIncome >= 0
        ? Math.round(rawSettings.monthlyIncome)
        : DEFAULT_SETTINGS.monthlyIncome,
    monthlyGoal:
      typeof rawSettings.monthlyGoal === 'number' &&
      Number.isFinite(rawSettings.monthlyGoal) &&
      rawSettings.monthlyGoal >= 0
        ? Math.round(rawSettings.monthlyGoal)
        : DEFAULT_SETTINGS.monthlyGoal,
    categoryBudgets,
  }

  return { rawSettings, settings }
}

function budgetDataResponse(settings: {
  monthlyBudget: number
  monthlyIncome: number
  monthlyGoal: number
  categoryBudgets: Record<string, number>
}) {
  const totalCategoryBudget = Object.values(settings.categoryBudgets).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0,
  )

  return {
    monthlyBudget: settings.monthlyBudget,
    monthlyIncome: settings.monthlyIncome,
    monthlyGoal: settings.monthlyGoal,
    totalCategoryBudget,
    categoryBudgets: settings.categoryBudgets,
    categories: APP_SPENDING_CATEGORIES.map((cat) => ({
      id: cat.id,
      label: cat.label,
      emoji: cat.emoji,
      budget: settings.categoryBudgets[cat.id] ?? 0,
    })),
  }
}

async function getBudget(householdId: string) {
  const { settings } = await getHouseholdSettings(householdId)
  return dataResponse(budgetDataResponse(settings))
}

async function updateBudget(
  req: Request,
  householdId: string,
  mode: 'patch' | 'put',
) {
  const body = await readBody(req)
  const { rawSettings, settings: current } = await getHouseholdSettings(householdId)
  const fields: Record<string, string> = {}

  let monthlyBudget = current.monthlyBudget
  let monthlyIncome = current.monthlyIncome
  let monthlyGoal = current.monthlyGoal
  let nextCategoryBudgets =
    mode === 'put' ? {} : { ...current.categoryBudgets }

  // monthlyBudget 검증
  const budgetVal = body.monthlyBudget !== undefined ? body.monthlyBudget : body.budget
  if (budgetVal !== undefined) {
    if (typeof budgetVal !== 'number' || !Number.isFinite(budgetVal) || budgetVal < 0) {
      fields.monthlyBudget = '0 이상의 숫자여야 합니다.'
    } else {
      monthlyBudget = Math.round(budgetVal)
    }
  } else if (mode === 'put') {
    monthlyBudget = DEFAULT_SETTINGS.monthlyBudget
  }

  // monthlyIncome 검증
  const incomeVal = body.monthlyIncome !== undefined ? body.monthlyIncome : body.income
  if (incomeVal !== undefined) {
    if (typeof incomeVal !== 'number' || !Number.isFinite(incomeVal) || incomeVal < 0) {
      fields.monthlyIncome = '0 이상의 숫자여야 합니다.'
    } else {
      monthlyIncome = Math.round(incomeVal)
    }
  } else if (mode === 'put') {
    monthlyIncome = DEFAULT_SETTINGS.monthlyIncome
  }

  // monthlyGoal 검증
  const goalVal =
    body.monthlyGoal !== undefined
      ? body.monthlyGoal
      : body.goal !== undefined
        ? body.goal
        : body.savingsGoal
  if (goalVal !== undefined) {
    if (typeof goalVal !== 'number' || !Number.isFinite(goalVal) || goalVal < 0) {
      fields.monthlyGoal = '0 이상의 숫자여야 합니다.'
    } else {
      monthlyGoal = Math.round(goalVal)
    }
  } else if (mode === 'put') {
    monthlyGoal = DEFAULT_SETTINGS.monthlyGoal
  }

  // categoryBudgets 검증 및 정규화
  const catBudgetsInput =
    body.categoryBudgets !== undefined ? body.categoryBudgets : body.categories
  if (catBudgetsInput !== undefined) {
    if (
      !catBudgetsInput ||
      typeof catBudgetsInput !== 'object' ||
      Array.isArray(catBudgetsInput)
    ) {
      fields.categoryBudgets =
        '객체 형식이어야 합니다. 예: { "food": 150000, "식비": 150000 }'
    } else {
      for (const [rawKey, rawAmount] of Object.entries(
        catBudgetsInput as Record<string, unknown>,
      )) {
        const normalizedId = normalizeCategoryKey(rawKey)
        if (!normalizedId) {
          fields[`categoryBudgets.${rawKey}`] = `지원하지 않는 카테고리입니다: '${rawKey}'`
          continue
        }
        if (
          typeof rawAmount !== 'number' ||
          !Number.isFinite(rawAmount) ||
          rawAmount < 0
        ) {
          fields[`categoryBudgets.${rawKey}`] = '0 이상의 숫자여야 합니다.'
          continue
        }
        nextCategoryBudgets[normalizedId] = Math.round(rawAmount)
      }
    }
  }

  // mode === 'put' 일 때 전달되지 않은 카테고리는 0 처리
  if (mode === 'put') {
    for (const cat of APP_SPENDING_CATEGORIES) {
      if (nextCategoryBudgets[cat.id] === undefined) {
        nextCategoryBudgets[cat.id] = 0
      }
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', '입력값을 확인해 주세요.', fields)
  }

  const nextSettings = {
    ...rawSettings,
    monthlyIncome,
    monthlyBudget,
    monthlyGoal,
    categoryBudgets: nextCategoryBudgets,
  }

  const { error } = await db()
    .from('households')
    .update({ settings: nextSettings })
    .eq('id', householdId)

  if (error) throw dbError(error)

  return dataResponse(
    budgetDataResponse({
      monthlyIncome,
      monthlyBudget,
      monthlyGoal,
      categoryBudgets: nextCategoryBudgets,
    }),
  )
}

interface BenefitRule {
  id: string
  categoryId: string
  rate: number
  monthlyCap: number
  minSpend?: number
  minTransactionAmount?: number
  paymentMethods?: string[]
  note?: string
}

interface PerformanceTier {
  minSpend: number
  monthlyTotalCap: number
}

interface CardEvent {
  title: string
  targetAmount: number
  deadline: string
  requireSimplePay?: boolean
  minSimplePayAmount?: number
  reward?: string
  note?: string
}

interface FullCard {
  id: string
  name: string
  issuer: string
  kind: 'credit' | 'check'
  minSpendForBenefits: number
  monthlyTotalCap: number
  baseRate: number
  baseCap: number
  benefits: BenefitRule[]
  performanceTiers: PerformanceTier[]
  gracePeriodMonths?: string[]
  event?: CardEvent
  active: boolean
}

const PREDEFINED_CARD_METADATA: Record<string, {
  gracePeriodMonths?: string[]
  event?: CardEvent
}> = {
  'ibk-kpass-credit': {
    gracePeriodMonths: ['2026-11', '2026-12'],
    event: {
      title: '신규 발급 캐시백 이벤트',
      targetAmount: 200_000,
      deadline: '2026-12-31',
      requireSimplePay: true,
      minSimplePayAmount: 10_000,
      reward: '캐시백 지급',
      note: '간편결제 1만원 이상 1건 필수 포함',
    },
  },
}

function won(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

function wonShort(value: number): string {
  if (value >= 10_000 && value % 10_000 === 0) {
    return `${value / 10_000}만원`
  }
  return won(value)
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function inferCategoryFromMerchant(merchant: string): string {
  const m = merchant.toLowerCase()
  if (/배달의민족|배민|요기요|쿠팡이츠|땡겨요/i.test(m)) return 'delivery'
  if (/스타벅스|스벅|이디야|투썸|메가커피|메가mgc|컴포즈|빽다방|파스쿠찌|폴바셋|공차|커피|카페/i.test(m)) return 'cafe'
  if (/gs25|cu|세븐일레븐|이마트24|미니스톱|이마트|홈플러스|롯데마트|트레이더스|코스트코|하나로마트|편의점|마트|슈퍼/i.test(m)) return 'mart'
  if (/아이깨끗해|세제|비누|샴푸|생필품|다이소|휴지|치약|칫솔|세탁|바디워시/i.test(m)) return 'living'
  if (/상품권|해피머니|북앤라이프|도서문화상품권|도서문화|컬쳐랜드/i.test(m)) return 'giftcard'
  if (/버스|지하철|티머니|코레일|ktx|srt|고속버스|카카오t|카카오택시|타다|택시|교통|대중교통/i.test(m)) return 'transport'
  if (/쿠팡|네이버쇼핑|무신사|29cm|올리브영|지그재그|에이블리|11번가|g마켓|옥션|백화점|아울렛/i.test(m)) return 'shopping'
  if (/식당|맥도날드|버거킹|맘스터치|롯데리아|서브웨이|아웃백|빕스|김밥|식사|한식|일식|중식|치킨|피자|갈비|고기|순대국|짜장|교촌|bbq|bhc/i.test(m)) return 'food'
  if (/skt|kt|lgu\+|lg유플러스|알뜰폰|통신요금|통신비/i.test(m)) return 'telecom'
  if (/넷플릭스|netflix|유튜브|youtube|디즈니|티빙|tving|웨이브|wavve|왓챠|멜론|지니|스포티파이|밀리의서재/i.test(m)) return 'subscription'
  if (/넥슨|라이엇|스팀|steam|블리자드|닌텐도|플레이스테이션|구글플레이|게임/i.test(m)) return 'game'
  if (/약국|의원|병원|치과|안과|내과|이비인후과|한의원/i.test(m)) return 'medical'
  if (/보험|화재|생명|해상/i.test(m)) return 'insurance'
  if (/관리비|도시가스|전기요금|한전/i.test(m)) return 'housing'
  if (/호텔|리조트|펜션|에어비앤비|항공|비행기|야놀자|여기어때/i.test(m)) return 'travel'
  if (/cgv|메가박스|롯데시네마|영화|극장|전시|공연/i.test(m)) return 'culture'
  return 'etc'
}

async function fetchFullCards(householdId: string): Promise<FullCard[]> {
  const { data, error } = await db()
    .from('cards')
    .select(
      'id, name, issuer, kind, min_spend_for_benefits, monthly_total_cap, base_rate, base_cap, benefits, performance_tiers, active',
    )
    .eq('household_id', householdId)
    .order('name', { ascending: true })

  if (error) throw dbError(error)

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const id = String(row.id)
    const meta = PREDEFINED_CARD_METADATA[id]
    return {
      id,
      name: String(row.name ?? ''),
      issuer: String(row.issuer ?? ''),
      kind: row.kind === 'check' ? 'check' : 'credit',
      minSpendForBenefits: Number(row.min_spend_for_benefits) || 0,
      monthlyTotalCap: Number(row.monthly_total_cap) || 0,
      baseRate: Number(row.base_rate) || 0,
      baseCap: Number(row.base_cap) || 0,
      benefits: Array.isArray(row.benefits) ? (row.benefits as BenefitRule[]) : [],
      performanceTiers: Array.isArray(row.performance_tiers)
        ? (row.performance_tiers as PerformanceTier[])
        : [],
      gracePeriodMonths: meta?.gracePeriodMonths,
      event: meta?.event,
      active: row.active !== false,
    }
  })
}

function findRuleForTx(
  rules: BenefitRule[],
  categoryId: string,
  paymentMethod?: string,
): BenefitRule | null {
  const categoryRule = rules.find((rule) => rule.categoryId === categoryId)
  if (categoryRule) return categoryRule

  return (
    rules.find((rule) => rule.paymentMethods?.includes(paymentMethod ?? '')) ?? null
  )
}

function matchPerformanceTier(
  card: FullCard,
  prevSpend: number,
): PerformanceTier | null {
  const tiers = [...(card.performanceTiers ?? [])].sort((a, b) => a.minSpend - b.minSpend)
  let matched: PerformanceTier | null = null
  for (const tier of tiers) {
    if (prevSpend >= tier.minSpend) matched = tier
    else break
  }
  return matched
}

interface EvaluatedCardMonth {
  card: FullCard
  prevSpend: number
  spend: number
  performanceMet: boolean
  inGracePeriod: boolean
  toRequirement: number
  nextTier: number | null
  nextTierRemaining: number
  totalBenefit: number
  totalCap: number
  performanceTier: PerformanceTier | null
  capLeft: number
  effectiveRate: number
  rows: {
    rule: BenefitRule
    spend: number
    raw: number
    applied: number
    capLeft: number
  }[]
}

function computeCardMonthEdge(
  card: FullCard,
  transactions: Record<string, unknown>[],
  month: string,
): EvaluatedCardMonth {
  const prevMonth = shiftMonth(month, -1)
  let prevSpend = 0
  let currentSpend = 0
  const monthTransactions: Record<string, unknown>[] = []

  for (const t of transactions) {
    if (String(t.card_id || t.cardId) !== card.id) continue
    if (t.status && t.status !== 'active') continue
    const date = String(t.date || '')
    const amt = Number(t.effective_amount ?? t.amount) || 0
    if (amt <= 0) continue

    if (date.startsWith(prevMonth)) {
      prevSpend += amt
    } else if (date.startsWith(month)) {
      currentSpend += amt
      monthTransactions.push(t)
    }
  }

  const inGracePeriod =
    (card.gracePeriodMonths?.includes(month) ?? false) &&
    prevSpend < card.minSpendForBenefits
  const effectivePrevSpend = inGracePeriod
    ? Math.max(prevSpend, card.minSpendForBenefits)
    : prevSpend
  const performanceMet = inGracePeriod || prevSpend >= card.minSpendForBenefits
  const performanceTier = matchPerformanceTier(card, effectivePrevSpend)
  const totalCap = performanceTier?.monthlyTotalCap ?? card.monthlyTotalCap

  const applicableRules = performanceMet
    ? card.benefits.filter(
        (rule) => effectivePrevSpend >= (rule.minSpend ?? card.minSpendForBenefits),
      )
    : []

  const ruleSpend = new Map<string, number>(applicableRules.map((r) => [r.id, 0]))
  const countedByRule = new Set<Record<string, unknown>>()

  for (const t of monthTransactions) {
    const catId = String(t.category_id || t.categoryId || '')
    const payMethod = t.payment_method ? String(t.payment_method) : undefined
    const amt = Number(t.effective_amount ?? t.amount) || 0

    if (
      catId === 'giftcard' ||
      catId === 'savings' ||
      Boolean(t.excluded) ||
      (t.merchant && /실적\s*채움/i.test(String(t.merchant)))
    ) {
      continue
    }

    const rule = findRuleForTx(applicableRules, catId, payMethod)
    if (!rule) continue

    countedByRule.add(t)
    if (rule.minTransactionAmount && amt < rule.minTransactionAmount) {
      continue
    }
    ruleSpend.set(rule.id, (ruleSpend.get(rule.id) ?? 0) + amt)
  }

  const rows = applicableRules.map((rule) => {
    const spend = ruleSpend.get(rule.id) ?? 0
    const raw = Math.round(spend * rule.rate)
    const applied = Math.min(raw, rule.monthlyCap)
    return {
      rule,
      spend,
      raw,
      applied,
      capLeft: Math.max(0, rule.monthlyCap - applied),
    }
  })

  let baseSpend = 0
  if (performanceMet && card.baseRate > 0) {
    for (const t of monthTransactions) {
      const catId = String(t.category_id || t.categoryId || '')
      if (
        catId === 'giftcard' ||
        catId === 'savings' ||
        Boolean(t.excluded) ||
        (t.merchant && /실적\s*채움/i.test(String(t.merchant))) ||
        countedByRule.has(t)
      ) {
        continue
      }
      baseSpend += Number(t.effective_amount ?? t.amount) || 0
    }
  }

  const baseApplied = performanceMet
    ? Math.min(Math.round(baseSpend * card.baseRate), card.baseCap)
    : 0

  const rawBenefit = rows.reduce((acc, r) => acc + r.applied, 0) + baseApplied
  const totalBenefit = Math.min(rawBenefit, totalCap)

  const tiers = new Set<number>()
  if (card.minSpendForBenefits > 0) tiers.add(card.minSpendForBenefits)
  for (const r of card.benefits) if (r.minSpend && r.minSpend > 0) tiers.add(r.minSpend)
  for (const pt of card.performanceTiers ?? []) if (pt.minSpend > 0) tiers.add(pt.minSpend)
  const sortedTiers = [...tiers].sort((a, b) => a - b)
  const nextTier = sortedTiers.find((tier) => tier > currentSpend) ?? null

  return {
    card,
    prevSpend,
    spend: currentSpend,
    performanceMet,
    inGracePeriod,
    toRequirement: Math.max(0, card.minSpendForBenefits - currentSpend),
    nextTier,
    nextTierRemaining: nextTier === null ? 0 : Math.max(0, nextTier - currentSpend),
    totalBenefit,
    totalCap,
    performanceTier,
    capLeft: Math.max(0, totalCap - totalBenefit),
    effectiveRate: currentSpend > 0 ? totalBenefit / currentSpend : 0,
    rows,
  }
}

async function recommendCards(
  householdId: string,
  input: Record<string, unknown>,
) {
  const rawMonth =
    input.month !== undefined && input.month !== null && input.month !== ''
      ? String(input.month)
      : todayKst().slice(0, 7)
  const month = normalizeMonth(rawMonth)
  const prevMonth = shiftMonth(month, -1)
  const amount = Math.max(0, Math.round(Number(input.amount) || 0))
  const merchant = input.merchant ? String(input.merchant).trim() : ''
  const paymentMethodInput = input.paymentMethod ? String(input.paymentMethod).trim() : ''

  let categoryId: string | null = null
  const catInput = input.category || input.categoryId || input.categoryMinor
  if (catInput) {
    categoryId = normalizeCategoryKey(String(catInput))
  }
  if (!categoryId && merchant) {
    categoryId = inferCategoryFromMerchant(merchant)
  }
  if (!categoryId) categoryId = 'etc'

  const categoryInfo = APP_SPENDING_CATEGORIES.find((c) => c.id === categoryId)
  const categoryLabel = categoryInfo?.label ?? '기타'

  const cards = (await fetchFullCards(householdId)).filter((c) => c.active)

  const prevRange = monthRange(prevMonth)
  const currRange = monthRange(month)
  const { data: txData, error: txError } = await db()
    .from('transactions')
    .select(
      'id, date, merchant, amount, effective_amount, category_id, card_id, payment_method, status, excluded',
    )
    .eq('household_id', householdId)
    .eq('status', 'active')
    .gte('date', prevRange.from)
    .lte('date', currRange.to)

  if (txError) throw dbError(txError)
  const transactions = (txData ?? []) as Record<string, unknown>[]

  const results = []
  let bestCard: Record<string, unknown> | null = null
  let eventCard: Record<string, unknown> | null = null

  for (const card of cards) {
    const before = computeCardMonthEdge(card, transactions, month)
    const defaultMethod = card.kind === 'check' ? '체크카드' : '신용카드'
    const simulatedMethod = paymentMethodInput || defaultMethod
    const simulatedTx: Record<string, unknown> = {
      id: '__sim__',
      date: `${month}-01`,
      merchant: merchant || '결제 예정',
      amount,
      effective_amount: amount,
      category_id: categoryId,
      card_id: card.id,
      payment_method: simulatedMethod,
      status: 'active',
      excluded: false,
    }

    const after = computeCardMonthEdge(card, [...transactions, simulatedTx], month)
    const gain = Math.max(0, after.totalBenefit - before.totalBenefit)

    const targetRule = findRuleForTx(card.benefits, categoryId, simulatedMethod)
    const applicable = targetRule
      ? before.rows.find((r) => r.rule.id === targetRule.id)
      : null
    const matchedRule = applicable?.rule ?? targetRule

    const ruleLabel = matchedRule
      ? matchedRule.paymentMethods?.includes(simulatedMethod) &&
        matchedRule.categoryId !== categoryId
        ? simulatedMethod
        : (APP_SPENDING_CATEGORIES.find((c) => c.id === matchedRule.categoryId)?.label ?? categoryLabel)
      : categoryLabel

    let reason = ''
    if (!before.performanceMet) {
      reason = `전월 실적 ${wonShort(card.minSpendForBenefits)} 미달`
    } else if (applicable) {
      if (applicable.rule.minTransactionAmount && amount < applicable.rule.minTransactionAmount) {
        reason = `건당 ${won(applicable.rule.minTransactionAmount)} 이상 결제 시 적용`
      } else if (gain > 0) {
        reason = `${ruleLabel} ${Math.round(applicable.rule.rate * 100)}% · +${won(gain)}`
      } else if (before.capLeft <= 0) {
        reason = '이번 달 통합 한도 소진'
      } else {
        reason = `${ruleLabel} 한도 소진`
      }
    } else if (targetRule?.minSpend) {
      reason = `전월 ${wonShort(targetRule.minSpend)} 실적 필요`
    } else if (gain > 0) {
      reason = `기본 적립 ${Math.round(card.baseRate * 100)}% · +${won(gain)}`
    } else if (before.capLeft <= 0) {
      reason = '이번 달 혜택 한도 소진'
    } else {
      reason = '이 카드엔 해당 혜택 조건이 없어요'
    }

    let eventInfo: Record<string, unknown> | null = null
    if (card.event) {
      const ev = card.event
      const cardTxs = transactions.filter(
        (t) => String(t.card_id) === card.id && String(t.date) <= ev.deadline,
      )
      const spentSoFar = cardTxs.reduce(
        (sum, t) => sum + (Number(t.effective_amount ?? t.amount) || 0),
        0,
      )
      const hasSimplePay = cardTxs.some(
        (t) =>
          String(t.payment_method).includes('간편결제') &&
          (Number(t.effective_amount ?? t.amount) || 0) >= (ev.minSimplePayAmount ?? 10000),
      )
      const willSimplePay =
        hasSimplePay ||
        (simulatedMethod.includes('간편결제') && amount >= (ev.minSimplePayAmount ?? 10000))
      const projectedSpent = spentSoFar + amount
      const isCompleted = spentSoFar >= ev.targetAmount && (!ev.requireSimplePay || hasSimplePay)
      const willComplete = projectedSpent >= ev.targetAmount && (!ev.requireSimplePay || willSimplePay)

      const today = todayKst()
      const dday = Math.max(
        0,
        Math.ceil((new Date(ev.deadline).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)),
      )

      eventInfo = {
        title: ev.title,
        targetAmount: ev.targetAmount,
        deadline: ev.deadline,
        daysLeft: dday,
        spentSoFar,
        remainingAmount: Math.max(0, ev.targetAmount - spentSoFar),
        requireSimplePay: Boolean(ev.requireSimplePay),
        simplePayConditionMet: hasSimplePay,
        isCompleted,
        willContribute: !isCompleted,
        willComplete,
        note: ev.note,
      }

      if (!isCompleted && !eventCard) {
        eventCard = {
          id: card.id,
          name: card.name,
          gain,
          event: eventInfo,
          recommendation: `이 카드로 결제 시 이벤트 실적 ${won(amount)}이 추가 누적됩니다 (현재 ${won(spentSoFar)} / ${won(ev.targetAmount)}, D-${dday}).`,
        }
      }
    }

    results.push({
      id: card.id,
      name: card.name,
      issuer: card.issuer,
      kind: card.kind,
      gain,
      eligible: before.performanceMet,
      reason,
      effectiveRate: after.effectiveRate,
      beforeBenefit: before.totalBenefit,
      afterBenefit: after.totalBenefit,
      capLeft: before.capLeft,
      inGracePeriod: before.inGracePeriod,
      performanceMet: before.performanceMet,
      event: eventInfo,
    })
  }

  results.sort((a, b) => {
    if (b.gain !== a.gain) return b.gain - a.gain
    if (b.performanceMet !== a.performanceMet) return Number(b.performanceMet) - Number(a.performanceMet)
    return b.effectiveRate - a.effectiveRate
  })

  bestCard = results[0] ?? null

  let summary = ''
  if (bestCard && Number(bestCard.gain) > 0) {
    summary = `${bestCard.name} 결제 시 ${bestCard.reason}으로 가장 유리합니다.`
    if (eventCard && eventCard.id !== bestCard.id) {
      const ev = eventCard.event as Record<string, unknown>
      summary += ` 다만 ${eventCard.name}의 ${ev.title} 달성까지 ${won(Number(ev.remainingAmount))} 남았으므로 이벤트 채우기를 우선할 수도 있습니다.`
    }
  } else if (eventCard) {
    const ev = eventCard.event as Record<string, unknown>
    summary = `할인 혜택은 없으나, ${eventCard.name}로 결제하여 ${ev.title}(남은 금액 ${won(Number(ev.remainingAmount))}) 실적을 채우는 것을 추천합니다.`
  } else if (bestCard) {
    summary = `현재 보유 카드 중 추가 할인 대상은 없습니다. (${bestCard.name}: ${bestCard.reason})`
  }

  return {
    month,
    simulated: {
      amount,
      merchant: merchant || null,
      categoryId,
      categoryLabel,
      paymentMethod: paymentMethodInput || null,
    },
    bestCard,
    eventCard,
    candidates: results,
    summary,
  }
}

async function getCardsStatus(householdId: string, monthInput?: string | null) {
  const month = normalizeMonth(monthInput || todayKst().slice(0, 7))
  const prevMonth = shiftMonth(month, -1)

  const cards = await fetchFullCards(householdId)

  const prevRange = monthRange(prevMonth)
  const currRange = monthRange(month)
  const { data: txData, error: txError } = await db()
    .from('transactions')
    .select(
      'id, date, merchant, amount, effective_amount, category_id, card_id, payment_method, status, excluded',
    )
    .eq('household_id', householdId)
    .eq('status', 'active')
    .gte('date', prevRange.from)
    .lte('date', currRange.to)

  if (txError) throw dbError(txError)
  const transactions = (txData ?? []) as Record<string, unknown>[]

  // 고정지출 중 아직 결제되지 않은 이달 예정분을 카드별로 집계
  const fixedForMonth = await fixedExpenses(householdId, month, false)
  const pendingFixedByCard = new Map<
    string,
    Array<{
      id: string
      name: string
      amount: number
      dayOfMonth: number
      candidateDate?: string | null
    }>
  >()

  for (const item of fixedForMonth.items) {
    if (!item.active || item.matchedTransactionId) continue
    if (!item.cardId) continue
    const list = pendingFixedByCard.get(String(item.cardId)) ?? []
    list.push({
      id: String(item.id),
      name: item.name,
      amount: item.amount,
      dayOfMonth: item.dayOfMonth,
      candidateDate: item.candidateDate || null,
    })
    pendingFixedByCard.set(String(item.cardId), list)
  }

  const eventCards = cards.filter((c) => c.event)
  let allEventTxs: Record<string, unknown>[] = []
  if (eventCards.length > 0) {
    const { data: evData } = await db()
      .from('transactions')
      .select('id, date, merchant, amount, effective_amount, card_id, payment_method, status')
      .eq('household_id', householdId)
      .eq('status', 'active')
      .in('card_id', eventCards.map((c) => c.id))
    allEventTxs = (evData ?? []) as Record<string, unknown>[]
  }

  const cardStatuses = []
  let totalBenefitSaved = 0
  let cardsMetCount = 0

  for (const card of cards) {
    const evaluated = computeCardMonthEdge(card, transactions, month)
    totalBenefitSaved += evaluated.totalBenefit
    if (evaluated.performanceMet) cardsMetCount++

    const pendingFixedItems = pendingFixedByCard.get(card.id) ?? []
    const pendingFixedExpensesSpend = pendingFixedItems.reduce(
      (sum, item) => sum + item.amount,
      0,
    )
    const projectedMonthEndSpend = evaluated.spend + pendingFixedExpensesSpend
    const projectedToRequirement = Math.max(0, card.minSpendForBenefits - projectedMonthEndSpend)
    const projectedPerformanceMet =
      evaluated.inGracePeriod || projectedMonthEndSpend >= card.minSpendForBenefits

    let eventStatus: Record<string, unknown> | null = null
    if (card.event) {
      const ev = card.event
      const cardTxs = allEventTxs.filter(
        (t) => String(t.card_id) === card.id && String(t.date) <= ev.deadline,
      )
      const spentSoFar = cardTxs.reduce(
        (sum, t) => sum + (Number(t.effective_amount ?? t.amount) || 0),
        0,
      )
      const hasSimplePay = cardTxs.some(
        (t) =>
          String(t.payment_method).includes('간편결제') &&
          (Number(t.effective_amount ?? t.amount) || 0) >= (ev.minSimplePayAmount ?? 10000),
      )
      const isCompleted = spentSoFar >= ev.targetAmount && (!ev.requireSimplePay || hasSimplePay)
      const today = todayKst()
      const daysLeft = Math.max(
        0,
        Math.ceil((new Date(ev.deadline).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)),
      )

      eventStatus = {
        title: ev.title,
        targetAmount: ev.targetAmount,
        deadline: ev.deadline,
        daysLeft,
        spentSoFar,
        remainingAmount: Math.max(0, ev.targetAmount - spentSoFar),
        requireSimplePay: Boolean(ev.requireSimplePay),
        simplePayConditionMet: hasSimplePay,
        isCompleted,
        reward: ev.reward ?? null,
        note: ev.note ?? null,
      }
    }

    cardStatuses.push({
      id: card.id,
      name: card.name,
      issuer: card.issuer,
      kind: card.kind,
      active: card.active,
      minSpendForBenefits: card.minSpendForBenefits,
      prevMonthSpend: evaluated.prevSpend,
      currentMonthSpend: evaluated.spend,
      pendingFixedExpensesSpend,
      projectedMonthEndSpend,
      performanceMet: evaluated.performanceMet,
      projectedPerformanceMet,
      inGracePeriod: evaluated.inGracePeriod,
      toRequirement: evaluated.toRequirement,
      projectedToRequirement,
      pendingFixedExpenses: pendingFixedItems,
      nextTier: evaluated.nextTier,
      nextTierRemaining: evaluated.nextTierRemaining,
      totalCap: evaluated.totalCap,
      benefitUsed: evaluated.totalBenefit,
      capLeft: evaluated.capLeft,
      effectiveRate: evaluated.effectiveRate,
      benefits: evaluated.rows.map((r) => ({
        id: r.rule.id,
        categoryId: r.rule.categoryId,
        categoryLabel:
          APP_SPENDING_CATEGORIES.find((c) => c.id === r.rule.categoryId)?.label ??
          r.rule.categoryId,
        rate: r.rule.rate,
        monthlyCap: r.rule.monthlyCap,
        spend: r.spend,
        appliedBenefit: r.applied,
        capLeft: r.capLeft,
        note: r.rule.note ?? null,
      })),
      event: eventStatus,
    })
  }

  return {
    month,
    summary: {
      totalCards: cards.length,
      cardsMeetingPerformance: cardsMetCount,
      cardsProjectedMeetingPerformance: cardStatuses.filter((c) => c.projectedPerformanceMet).length,
      totalBenefitSaved,
    },
    cards: cardStatuses,
  }
}

async function getSpendingPace(householdId: string, monthInput?: string | null) {
  try {
    const month = normalizeMonth(monthInput || todayKst().slice(0, 7))
    const today = todayKst()
    const range = monthRange(month)
    const totalDays = Number(range.lastDay)

    let elapsedDays = 0
    if (today < range.from) {
      elapsedDays = 0
    } else if (today > range.to) {
      elapsedDays = totalDays
    } else {
      elapsedDays = Number(today.slice(8, 10))
    }
    const remainingDays = Math.max(0, totalDays - elapsedDays)
    const elapsedPercent = totalDays > 0 ? Math.round((elapsedDays / totalDays) * 1000) / 10 : 0

    const { settings } = await getHouseholdSettings(householdId)
    const monthlyBudget = settings.monthlyBudget
    const categoryBudgets = settings.categoryBudgets

    const agg = await monthlyAggregate(householdId, month)
    const spentSoFar = agg.livingExpense
    const remainingBudget = monthlyBudget - spentSoFar
    const budgetUsedPercent = monthlyBudget > 0 ? Math.round((spentSoFar / monthlyBudget) * 1000) / 10 : 0

    const dayProgressRatio = totalDays > 0 ? elapsedDays / totalDays : 0
    const paceRatio =
      monthlyBudget > 0 && dayProgressRatio > 0
        ? Math.round(((spentSoFar / monthlyBudget) / dayProgressRatio) * 100) / 100
        : 1.0

    const projectedMonthEndSpend =
      elapsedDays > 0 ? Math.round((spentSoFar / elapsedDays) * totalDays) : spentSoFar
    const projectedDifference = projectedMonthEndSpend - monthlyBudget
    const currentDailyAverage = elapsedDays > 0 ? Math.round(spentSoFar / elapsedDays) : 0
    const recommendedDailyBudget =
      remainingDays > 0 ? Math.max(0, Math.round(remainingBudget / remainingDays)) : 0

    let status: 'excellent' | 'normal' | 'warning' | 'danger' = 'normal'
    let statusLabel = '적정 페이스 🟢'

    if (paceRatio <= 0.85) {
      status = 'excellent'
      statusLabel = '매우 여유로움 🟢'
    } else if (paceRatio <= 1.05) {
      status = 'normal'
      statusLabel = '적정 페이스 🟢'
    } else if (paceRatio <= 1.25) {
      status = 'warning'
      statusLabel = '주의 요망 🟡'
    } else {
      status = 'danger'
      statusLabel = '예산 초과 위험 🔴'
    }

    const surgeCategories = []
    for (const cat of agg.byCategory) {
      const catId =
        cat.categoryMajor === '생활비'
          ? (SHEET_TO_APP_CATEGORY[`${cat.categoryMajor}|${cat.categoryMinor}`] ?? 'etc')
          : null
      if (!catId) continue

      const budget = categoryBudgets[catId] ?? 0
      const spent = cat.amount
      if (spent <= 0) continue

      const catBudgetPercent = budget > 0 ? Math.round((spent / budget) * 1000) / 10 : null
      const catPace =
        budget > 0 && dayProgressRatio > 0
          ? Math.round(((spent / budget) / dayProgressRatio) * 100) / 100
          : null

      if (budget > 0 && (spent > budget || (catPace && catPace >= 1.2))) {
        surgeCategories.push({
          categoryId: catId,
          categoryMinor: cat.categoryMinor,
          budget,
          spent,
          budgetUsedPercent: catBudgetPercent,
          paceRatio: catPace,
          status: spent > budget ? '초과' : '빠름',
        })
      }
    }

    surgeCategories.sort((a, b) => (b.paceRatio ?? 0) - (a.paceRatio ?? 0))

    const [currYear, currMonth] = month.split('-')
    const message = `${Number(currMonth)}월 ${elapsedDays}일 기준 생활비 예산 ${won(monthlyBudget)} 중 ${won(spentSoFar)}(${budgetUsedPercent}%)을 사용했습니다. 한 달의 ${elapsedPercent}%가 지난 시점에 페이스는 ${paceRatio}배로 [${statusLabel}] 상태입니다. 현재 추세 유지 시 월말 예상 지출은 ${won(projectedMonthEndSpend)}(예산 대비 ${projectedDifference >= 0 ? '+' : ''}${won(projectedDifference)})입니다. 남은 ${remainingDays}일 동안 일일 권장 지출액은 ${won(recommendedDailyBudget)}입니다.`

    return {
      month,
      asOfDate: today,
      days: {
        total: totalDays,
        elapsed: elapsedDays,
        remaining: remainingDays,
        elapsedPercent,
      },
      budget: {
        monthlyBudget,
        spentSoFar,
        remainingBudget,
        budgetUsedPercent,
        currentDailyAverage,
        recommendedDailyBudget,
      },
      pace: {
        ratio: paceRatio,
        projectedMonthEndSpend,
        projectedDifference,
        status,
        statusLabel,
      },
      surgeCategories,
      message,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? `${err.message} (${err.stack})` : String(err)
    throw new ApiError(500, 'PACE_ERROR', msg)
  }
}

async function getFixedExpensesTodayOrPending(
  householdId: string,
  targetDateInput?: string | null,
  targetMonthInput?: string | null,
  mode: 'today' | 'pending' = 'today',
) {
  const targetDate = isDateString(targetDateInput ?? '') ? targetDateInput! : todayKst()
  const targetMonth = normalizeMonth(targetMonthInput ?? targetDate.slice(0, 7))

  const allFixed = await fixedExpenses(householdId, targetMonth, false)
  const items = allFixed.items

  const dueToday = []
  const overdueUnrecorded = []
  const upcomingThisMonth = []
  const recordedThisMonth = []

  for (const item of items) {
    if (!item.active) continue

    if (item.matchedTransactionId) {
      recordedThisMonth.push(item)
      continue
    }

    const cDate = item.candidateDate || item.date
    if (!cDate) {
      upcomingThisMonth.push(item)
      continue
    }

    if (cDate === targetDate) {
      dueToday.push(item)
    } else if (cDate < targetDate) {
      overdueUnrecorded.push(item)
    } else {
      upcomingThisMonth.push(item)
    }
  }

  const totalMonthlyFixed = allFixed.total
  const recordedAmount = recordedThisMonth.reduce((s, i) => s + i.amount, 0)
  const dueTodayAmount = dueToday.reduce((s, i) => s + i.amount, 0)
  const overdueAmount = overdueUnrecorded.reduce((s, i) => s + i.amount, 0)
  const upcomingAmount = upcomingThisMonth.reduce((s, i) => s + i.amount, 0)
  const remainingAmount = dueTodayAmount + overdueAmount + upcomingAmount

  let message = ''
  if (dueToday.length > 0 && overdueUnrecorded.length > 0) {
    message = `오늘 결제 예정인 고정지출이 ${dueToday.length}건(${won(dueTodayAmount)}) 있고, 아직 미기록된 이전 고정지출이 ${overdueUnrecorded.length}건(${won(overdueAmount)}) 있습니다.`
  } else if (dueToday.length > 0) {
    const names = dueToday.map((d) => d.name).join(', ')
    message = `오늘 결제 예정인 고정지출이 ${dueToday.length}건(${names}, 총 ${won(dueTodayAmount)}) 있습니다.`
  } else if (overdueUnrecorded.length > 0) {
    const names = overdueUnrecorded.map((d) => d.name).join(', ')
    message = `예정일이 지났으나 아직 가계부에 미기록된 고정지출이 ${overdueUnrecorded.length}건(${names}, 총 ${won(overdueAmount)}) 있습니다.`
  } else {
    message = `오늘 결제 예정이거나 미기록된 고정지출이 없습니다. (남은 이달 예정: ${upcomingThisMonth.length}건, ${won(upcomingAmount)})`
  }

  return {
    date: targetDate,
    month: targetMonth,
    summary: {
      totalMonthlyFixed,
      recordedAmount,
      remainingAmount,
      dueTodayCount: dueToday.length,
      dueTodayAmount,
      overdueCount: overdueUnrecorded.length,
      overdueAmount,
      upcomingCount: upcomingThisMonth.length,
      upcomingAmount,
    },
    dueToday,
    overdueUnrecorded,
    upcomingThisMonth,
    recordedThisMonth,
    message,
  }
}

interface SmartParseOptions {
  defaultYear?: number
  autoRecord?: boolean
  force?: boolean
  memo?: string
  categoryId?: string
  cardId?: string
  cardName?: string
  card?: string
  paymentMethod?: string
}

async function smartParseTransaction(
  householdId: string,
  text: string,
  options?: SmartParseOptions,
) {
  if (!text || typeof text !== 'string') {
    throw new ApiError(400, 'BAD_REQUEST', '파싱할 텍스트(text)를 입력해주세요.')
  }

  const raw = text.trim()
  const today = todayKst()
  const currentYear = options?.defaultYear || Number(today.slice(0, 4))

  let amount = 0
  const amountMatch =
    raw.match(/([\d,]+)\s*원/) ||
    raw.match(/(?:결제|승인|일시불|금액)\s*[:：]?\s*([\d,]+)/)
  if (amountMatch) {
    amount = Number(amountMatch[1].replace(/,/g, '')) || 0
  }

  let parsedDate = today
  let parsedTime: string | null = null
  const fullDateMatch = raw.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  const shortDateMatch = raw.match(/(\d{1,2})[\/\.](\d{1,2})/)
  const koreanDateMatch = raw.match(/(\d{1,2})월\s*(\d{1,2})일/)
  const timeMatch = raw.match(/(\d{1,2}):(\d{2})/)

  if (timeMatch) {
    parsedTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
  }

  if (fullDateMatch) {
    parsedDate = `${fullDateMatch[1]}-${fullDateMatch[2].padStart(2, '0')}-${fullDateMatch[3].padStart(2, '0')}`
  } else if (shortDateMatch) {
    parsedDate = `${currentYear}-${shortDateMatch[1].padStart(2, '0')}-${shortDateMatch[2].padStart(2, '0')}`
  } else if (koreanDateMatch) {
    parsedDate = `${currentYear}-${koreanDateMatch[1].padStart(2, '0')}-${koreanDateMatch[2].padStart(2, '0')}`
  } else if (/어제/.test(raw)) {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    parsedDate = d.toISOString().slice(0, 10)
  }

  let cardRef: string | null = null
  let paymentMethod = options?.paymentMethod || '신용카드'

  if (!options?.paymentMethod) {
    if (/체크/.test(raw)) paymentMethod = '체크카드'
    else if (/간편결제|페이|pay/i.test(raw)) paymentMethod = '간편결제'
    else if (/계좌|이체/.test(raw)) paymentMethod = '계좌이체'
  }

  const bracketMatch = raw.match(/\[([^\]]+)\]/)
  const bracketContent = bracketMatch ? bracketMatch[1] : ''

  const cardKeywords = [
    { key: 'ibk-kpass-credit', match: /ibk|기업은행|k[- ]?패스|케이패스/i },
    { key: 'shinhan-nara-check', match: /신한.*나라|나라.*신한|신한나라/i },
    { key: 'kb-nara-check', match: /국민.*나라|나라.*국민|kb.*나라|나라.*kb|kb나라|국민나라/i },
    { key: 'kb-toktok-my-point', match: /톡톡|kb\s*pay|kbpay/i },
    { key: 'kb-bonus-check', match: /직장인|보너스|kb국민.*체크|국민체크|국민카드|kb카드/i },
    { key: 'lotte-loca-365', match: /롯데|loca|로카/i },
    { key: 'mg-plus-s-hana', match: /하나|mg\+|새마을.*하나|플러스s/i },
    { key: 'woori-skt', match: /우리.*skt|skt.*우리/i },
    { key: 'mg-honey-check', match: /새마을|꿀카드/i },
  ]

  const explicitCard = options?.cardId || options?.cardName || options?.card
  if (explicitCard) {
    cardRef = String(explicitCard)
  } else {
    for (const ck of cardKeywords) {
      if (ck.match.test(bracketContent) || ck.match.test(raw)) {
        cardRef = ck.key
        break
      }
    }
  }

  let matchedCard: Record<string, unknown> | null = null
  if (cardRef) {
    try {
      matchedCard = (await findCard(householdId, cardRef)) as unknown as Record<string, unknown>
    } catch {
      // not critical
    }
  }

  if (matchedCard) {
    if (paymentMethod === '신용카드' && matchedCard.kind === 'check') {
      paymentMethod = '체크카드'
    }
  }

  const cleaned = raw
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/웹발신|web발신/gi, ' ')
    .replace(/\d{4}[-./]\d{1,2}[-./]\d{1,2}/g, ' ')
    .replace(/\d{1,2}[\/\.]\d{1,2}/g, ' ')
    .replace(/\d{1,2}월\s*\d{1,2}일/g, ' ')
    .replace(/\d{1,2}:\d{2}/g, ' ')
    .replace(/[\d,]+\s*원/g, ' ')
    .replace(/(?:금액|승인|일시불|결제|취소|누적|잔여|머니\s*결제|완료|고객님|회원님)/g, ' ')
    .replace(/[가-힣]\*[가-힣]/g, ' ')
    .replace(/\(\d{1,2}\*\d{1,2}\)/g, ' ')
    .replace(/[()[\]{}<>,;!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const words = cleaned
    .split(' ')
    .filter((w) => w.length > 1 && !/^(카드|체크|신용|페이|원|건)$/.test(w))
  let rawMerchant = words[0] || '가맹점 미상'
  let merchant = rawMerchant.replace(/(?:에서부터|에서|으로|에게|로|에|의)$/, '').trim()
  if (!merchant) merchant = rawMerchant

  let inferredCategoryId = inferCategoryFromMerchant(merchant)
  // 쿠팡, 네이버쇼핑 등 종합몰 결제일 때 본문에 상품명(아이깨끗해, 세제, 커피, 배달 등)이 들어있으면 해당 카테고리를 우선 적용
  if (inferredCategoryId === 'shopping' || inferredCategoryId === 'etc') {
    const detailCat = inferCategoryFromMerchant(raw)
    if (detailCat !== 'etc' && detailCat !== 'shopping') {
      inferredCategoryId = detailCat
    }
  }
  const categoryId = options?.categoryId || inferredCategoryId
  const categoryLabel = APP_SPENDING_CATEGORIES.find((c) => c.id === categoryId)?.label ?? '기타'
  const sheetCat = APP_CATEGORY_TO_SHEET[categoryId] ?? {
    major: '생활비',
    minor: '기타',
  }

  const { data: dupData } = await db()
    .from('transactions')
    .select(
      'id, date, merchant, amount, effective_amount, category_id, card_id, payment_method, created_at',
    )
    .eq('household_id', householdId)
    .eq('status', 'active')
    .eq('date', parsedDate)

  const duplicateCandidates = ((dupData ?? []) as Record<string, unknown>[]).filter((t) => {
    const amt = Number(t.effective_amount ?? t.amount) || 0
    if (amt !== amount) return false
    const existingMerchant = String(t.merchant ?? '').toLowerCase()
    const targetMerchant = merchant.toLowerCase()
    return (
      existingMerchant.includes(targetMerchant) ||
      targetMerchant.includes(existingMerchant) ||
      (matchedCard && String(t.card_id) === String(matchedCard.id))
    )
  })

  const isDuplicateCandidate = duplicateCandidates.length > 0
  const confidence =
    amount > 0 && merchant !== '가맹점 미상' ? 'high' : amount > 0 ? 'medium' : 'low'

  const shouldAutoRecord = Boolean(options?.autoRecord)
  let recorded = false
  let requiresConfirmation = false
  let createdTransaction: Record<string, unknown> | null = null
  let message = isDuplicateCandidate
    ? `오늘 동일한 금액(${won(amount)})의 기존 거래(${duplicateCandidates[0]?.merchant})가 존재합니다.`
    : `${matchedCard?.name ?? paymentMethod} ${won(amount)}(${merchant}) 정보가 정상 파싱되었습니다.`

  if (shouldAutoRecord) {
    if (amount <= 0) {
      message = '결제 금액을 인식하지 못하여 자동 등록되지 않았습니다.'
    } else if (isDuplicateCandidate && !options?.force) {
      requiresConfirmation = true
      message = `오늘 동일한 금액(${won(amount)})의 거래 내역(${duplicateCandidates[0]?.merchant})이 이미 존재합니다. 중복 입력을 방지하기 위해 자동 등록을 보류했습니다. (강제 등록: force: true)`
    } else {
      const sheetCat = APP_CATEGORY_TO_SHEET[categoryId] ?? {
        major: '생활비',
        minor: '기타',
      }
      const category = await resolveCategory(sheetCat.major, sheetCat.minor)
      const usesCard = ['신용카드', '체크카드', '간편결제'].includes(paymentMethod)
      const cardId = usesCard && matchedCard ? (matchedCard.id as string) : null

      const payload = {
        household_id: householdId,
        id: crypto.randomUUID(),
        date: parsedDate,
        merchant,
        amount,
        category_id: categoryId,
        card_id: cardId,
        memo: options?.memo || 'MUSE 모바일 알림 자동 입력',
        excluded: false,
        category_major: sheetCat.major,
        category_minor: sheetCat.minor,
        category_group: category.category_group,
        correction: 0,
        payment_method: paymentMethod,
        note: '',
        status: 'active',
        source: 'muse',
        created_by: 'muse',
        updated_by: 'muse',
      }

      const { data: inserted, error: insertError } = await db()
        .from('transactions')
        .insert(payload)
        .select('*')
        .single()

      if (insertError) throw dbError(insertError)

      const annotated = await annotateSingle(inserted as Record<string, unknown>)
      createdTransaction = toApiTransaction(annotated) as unknown as Record<string, unknown>
      recorded = true
      message = `${matchedCard?.name ?? paymentMethod} ${won(amount)}(${merchant}) 결제가 ${categoryLabel} 카테고리에 성공적으로 등록되었습니다.`
    }
  }

  return {
    raw,
    parsed: {
      date: parsedDate,
      time: parsedTime,
      merchant,
      amount,
      categoryId,
      categoryLabel,
      categoryMajor: sheetCat.major,
      categoryMinor: sheetCat.minor,
      type: sheetCat.major,
      cardId: matchedCard?.id ?? null,
      cardName: matchedCard?.name ?? null,
      paymentMethod,
    },
    isDuplicateCandidate,
    duplicateCandidates: duplicateCandidates.map((t) => ({
      id: t.id,
      date: t.date,
      merchant: t.merchant,
      amount: Number(t.effective_amount ?? t.amount),
      paymentMethod: t.payment_method,
      createdAt: t.created_at,
    })),
    confidence,
    recorded,
    requiresConfirmation,
    createdTransaction,
    message,
  }
}

async function getUnredeemedGiftCards(householdId: string, monthInput?: string | null) {
  const { data: txData, error: txError } = await db()
    .from('transactions')
    .select(
      'id, date, merchant, amount, effective_amount, category_major, category_minor, category_group, category_id, card_id, payment_method, note, memo, status, created_at',
    )
    .eq('household_id', householdId)
    .eq('status', 'active')
    .order('date', { ascending: false })

  if (txError) throw dbError(txError)
  const allTxs = (txData ?? []) as Record<string, unknown>[]

  // 1. [linked_tx:<purchaseId>] 태그가 붙은 현금화(환급) 거래 매핑
  const redemptionsByPurchaseId = new Map<string, Record<string, unknown>>()
  for (const t of allTxs) {
    const noteStr = String(t.note ?? '')
    const match = noteStr.match(/\[linked_tx:([^\]]+)\]/)
    if (match) {
      redemptionsByPurchaseId.set(match[1], t)
    }
  }

  // 2. 상품권 구매 거래 식별 (단, 환급/현금화/수입 거래는 제외)
  const purchases = allTxs.filter((t) => {
    const major = String(t.category_major ?? '')
    const minor = String(t.category_minor ?? '')
    const catId = String(t.category_id ?? '')
    const merch = String(t.merchant ?? '')

    if (major === '수입' || major === '투자회수') return false
    if (/현금화|환급|페이즈.*입금/i.test(merch)) return false

    return (
      minor === '상품권' ||
      catId === 'giftcard' ||
      /상품권|북앤라이프|도서문화|해피머니|컬쳐랜드/i.test(merch)
    )
  })

  const filteredPurchases = monthInput
    ? purchases.filter((p) => String(p.date).startsWith(monthInput))
    : purchases

  const unredeemedList = []
  const redeemedList = []
  const cardsList = await listCards(householdId)
  const cardMap = new Map(cardsList.map((c) => [c.id, c.name]))

  for (const p of filteredPurchases) {
    const pid = String(p.id)
    const redemption = redemptionsByPurchaseId.get(pid)
    const cardName = p.card_id ? (cardMap.get(String(p.card_id)) ?? String(p.card_id)) : null
    const amt = Number(p.effective_amount ?? p.amount) || 0

    const item = {
      id: pid,
      date: String(p.date),
      merchant: String(p.merchant),
      amount: amt,
      cardId: p.card_id ? String(p.card_id) : null,
      cardName,
      paymentMethod: p.payment_method ? String(p.payment_method) : null,
      memo: String(p.memo ?? ''),
      createdAt: p.created_at,
    }

    if (redemption) {
      redeemedList.push({
        purchase: item,
        redemption: {
          id: String(redemption.id),
          date: String(redemption.date),
          merchant: String(redemption.merchant),
          amount: Number(redemption.effective_amount ?? redemption.amount) || 0,
          paymentMethod: redemption.payment_method ? String(redemption.payment_method) : null,
          createdAt: redemption.created_at,
        },
      })
    } else {
      unredeemedList.push(item)
    }
  }

  const unredeemedAmount = unredeemedList.reduce((sum, i) => sum + i.amount, 0)
  const redeemedAmount = redeemedList.reduce((sum, i) => sum + i.purchase.amount, 0)

  return {
    summary: {
      totalPurchasedCount: filteredPurchases.length,
      totalPurchasedAmount: unredeemedAmount + redeemedAmount,
      unredeemedCount: unredeemedList.length,
      unredeemedAmount,
      redeemedCount: redeemedList.length,
      redeemedAmount,
    },
    unredeemed: unredeemedList,
    redeemed: redeemedList,
  }
}

async function cashoutGiftCard(req: Request, householdId: string) {
  const body = await readBody(req)
  const purchaseId = String(
    body.purchaseTransactionId || body.purchaseId || body.linkedTransactionId || '',
  ).trim()
  if (!purchaseId) {
    throw new ApiError(
      400,
      'BAD_REQUEST',
      '현금화할 원본 상품권 구매 거래 ID(purchaseTransactionId)가 필요합니다.',
    )
  }

  const { data: purchase, error: pError } = await db()
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .eq('id', purchaseId)
    .maybeSingle()

  if (pError) throw dbError(pError)
  if (!purchase) {
    throw new ApiError(404, 'NOT_FOUND', `구매 거래 ID(${purchaseId})를 찾을 수 없습니다.`)
  }

  const today = todayKst()
  const date = isDateString(String(body.date ?? '')) ? String(body.date) : today
  const purchaseAmount = Number(purchase.effective_amount ?? purchase.amount) || 0
  const amount = typeof body.amount === 'number' && body.amount > 0 ? body.amount : purchaseAmount
  const merchant = String(body.merchant || `상품권 현금화 (${purchase.merchant ?? '페이즈'})`)
  const memo = String(body.memo || `${purchase.merchant ?? '상품권'} 현금화 완료`)
  const paymentMethod = String(body.paymentMethod || '계좌이체')

  const note = `[linked_tx:${purchaseId}] ${body.note ?? ''}`.trim()

  const payload = {
    household_id: householdId,
    id: crypto.randomUUID(),
    date,
    merchant,
    amount,
    category_id: 'etc',
    card_id: null,
    memo,
    excluded: true,
    category_major: '투자회수',
    category_minor: '기타투자',
    category_group: '집계 제외',
    correction: 0,
    payment_method: paymentMethod,
    note,
    status: 'active',
    source: 'muse',
    created_by: 'muse',
    updated_by: 'muse',
  }

  const { data: inserted, error: iError } = await db()
    .from('transactions')
    .insert(payload)
    .select('*')
    .single()

  if (iError) throw dbError(iError)

  const annotated = await annotateSingle(inserted as Record<string, unknown>)
  return dataResponse(
    {
      redeemed: true,
      purchaseTransaction: toApiTransaction(purchase as Record<string, unknown>),
      redemptionTransaction: toApiTransaction(annotated),
      message: `${purchase.merchant} (${won(amount)}) 현금화 거래가 성공적으로 연결 등록되었습니다.`,
    },
    201,
  )
}

async function getInsightsAttention(householdId: string, monthInput?: string | null) {
  try {
    const month = normalizeMonth(monthInput || todayKst().slice(0, 7))
    const today = todayKst()

    // 1. 고정지출 당일 및 미기록 건
    const fixedData = await getFixedExpensesTodayOrPending(householdId, today, month, 'today')
    const dueToday = fixedData.dueToday || []
    const overdue = fixedData.overdueUnrecorded || []

    // 2. 카드 실적 현황 (고정지출 예정분 반영)
    const cardsData = await getCardsStatus(householdId, month)
    const cards = cardsData.cards || []

    const atRiskCards = cards.filter(
      (c) =>
        c.active &&
        !c.inGracePeriod &&
        c.minSpendForBenefits > 0 &&
        !c.projectedPerformanceMet,
    )

    const eventCardsNeedingAttention = cards
      .filter((c) => c.active && c.event && !c.event.isCompleted)
      .map((c) => ({
        cardId: c.id,
        cardName: c.name,
        event: c.event,
      }))

    // 3. 페이스 급증/초과 카테고리
    const paceData = await getSpendingPace(householdId, month)
    const surgeCategories = paceData.surgeCategories || []

    // 4. 미현금화 상품권
    const giftCardsData = await getUnredeemedGiftCards(householdId, month)
    const unredeemedCount = giftCardsData.summary.unredeemedCount || 0
    const unredeemedAmount = giftCardsData.summary.unredeemedAmount || 0

    const attentionCount =
      dueToday.length +
      overdue.length +
      atRiskCards.length +
      eventCardsNeedingAttention.length +
      surgeCategories.length +
      (unredeemedCount > 0 ? 1 : 0)

    // 한 줄 요약 brief 생성
    const briefParts: string[] = []
    if (dueToday.length > 0) {
      briefParts.push(`오늘 결제 예정 고정지출 ${dueToday.length}건(${won(fixedData.summary.dueTodayAmount)})`)
    }
    if (overdue.length > 0) {
      briefParts.push(`미기록 고정지출 ${overdue.length}건(${won(fixedData.summary.overdueAmount)})`)
    }
    if (atRiskCards.length > 0) {
      const cardNames = atRiskCards
        .map((c) => `${c.name}(${won(c.projectedToRequirement)} 부족)`)
        .join(', ')
      briefParts.push(`실적 달성 필요 카드: ${cardNames}`)
    }
    if (surgeCategories.length > 0) {
      const catNames = surgeCategories.map((s) => s.categoryMinor).join(', ')
      briefParts.push(`예산 초과·주의 카테고리(${catNames})`)
    }
    if (unredeemedCount > 0) {
      briefParts.push(`미현금화 상품권 ${unredeemedCount}건(${won(unredeemedAmount)})`)
    }

    let brief = ''
    if (briefParts.length > 0) {
      brief = `현재 신경 써야 할 항목이 ${attentionCount}건 있습니다: ${briefParts.join(' / ')}.`
    } else {
      brief = `현재 긴급히 신경 써야 할 지출이나 실적 마감 건이 없습니다. (예산 사용률 ${paceData.budget.budgetUsedPercent}%)`
    }

    return {
      date: today,
      month,
      attentionCount,
      urgent: dueToday.length > 0 || overdue.length > 0,
      brief,
      fixedExpenses: {
        dueTodayCount: dueToday.length,
        dueTodayAmount: fixedData.summary.dueTodayAmount,
        dueToday: dueToday.map((i) => ({
          id: i.id,
          name: i.name,
          amount: i.amount,
          dayOfMonth: i.dayOfMonth,
          cardId: i.cardId,
        })),
        overdueCount: overdue.length,
        overdueAmount: fixedData.summary.overdueAmount,
        overdue: overdue.map((i) => ({
          id: i.id,
          name: i.name,
          amount: i.amount,
          dayOfMonth: i.dayOfMonth,
          cardId: i.cardId,
        })),
      },
      cards: {
        atRiskCount: atRiskCards.length,
        atRiskCards: atRiskCards.map((c) => ({
          id: c.id,
          name: c.name,
          minSpendForBenefits: c.minSpendForBenefits,
          currentMonthSpend: c.currentMonthSpend,
          pendingFixedExpensesSpend: c.pendingFixedExpensesSpend,
          projectedMonthEndSpend: c.projectedMonthEndSpend,
          projectedToRequirement: c.projectedToRequirement,
          pendingFixedExpenses: c.pendingFixedExpenses,
        })),
        events: eventCardsNeedingAttention,
      },
      budget: {
        surgeCount: surgeCategories.length,
        surgeCategories,
      },
      giftCards: {
        unredeemedCount,
        unredeemedAmount,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? `${err.message} (${err.stack})` : String(err)
    throw new ApiError(500, 'ATTENTION_ERROR', msg)
  }
}

async function getDashboard(householdId: string, monthInput?: string | null) {
  try {
    const month = normalizeMonth(monthInput || todayKst().slice(0, 7))
    const today = todayKst()

    const [budgetRes, cardsData, paceData, fixedData, attentionData, giftCardsData] =
      await Promise.all([
        getHouseholdSettings(householdId),
        getCardsStatus(householdId, month),
        getSpendingPace(householdId, month),
        getFixedExpensesTodayOrPending(householdId, today, month, 'today'),
        getInsightsAttention(householdId, month),
        getUnredeemedGiftCards(householdId, month),
      ])

    const { settings } = budgetRes

    return {
      month,
      today,
      budget: {
        monthlyIncome: settings.monthlyIncome,
        monthlyBudget: settings.monthlyBudget,
        monthlyGoal: settings.monthlyGoal,
        spent: paceData.budget.spentSoFar,
        remaining: paceData.budget.remainingBudget,
        budgetUsedPercent: paceData.budget.budgetUsedPercent,
        projectedMonthEndSpend: paceData.pace.projectedMonthEndSpend,
        status: paceData.pace.status,
        recommendedDailyBudget: paceData.budget.recommendedDailyBudget,
      },
      cards: {
        summary: cardsData.summary,
        list: cardsData.cards.map((c) => ({
          id: c.id,
          name: c.name,
          issuer: c.issuer,
          kind: c.kind,
          minSpendForBenefits: c.minSpendForBenefits,
          currentSpend: c.currentMonthSpend,
          pendingFixedSpend: c.pendingFixedExpensesSpend,
          projectedSpend: c.projectedMonthEndSpend,
          toRequirement: c.toRequirement,
          projectedToRequirement: c.projectedToRequirement,
          performanceMet: c.performanceMet,
          projectedPerformanceMet: c.projectedPerformanceMet,
          inGracePeriod: c.inGracePeriod,
          benefitUsed: c.benefitUsed,
          capLeft: c.capLeft,
          event: c.event,
          pendingFixedExpenses: c.pendingFixedExpenses,
        })),
      },
      fixedExpenses: {
        totalMonthlyFixed: fixedData.summary.totalMonthlyFixed,
        recordedAmount: fixedData.summary.recordedAmount,
        remainingAmount: fixedData.summary.remainingAmount,
        dueTodayCount: fixedData.summary.dueTodayCount,
        dueTodayAmount: fixedData.summary.dueTodayAmount,
        overdueCount: fixedData.summary.overdueCount,
        overdueAmount: fixedData.summary.overdueAmount,
        upcomingCount: fixedData.summary.upcomingCount,
        upcomingAmount: fixedData.summary.upcomingAmount,
        dueToday: fixedData.dueToday,
        overdue: fixedData.overdueUnrecorded,
        upcoming: fixedData.upcomingThisMonth,
      },
      pace: {
        daysElapsed: paceData.days.elapsed,
        daysTotal: paceData.days.total,
        daysRemaining: paceData.days.remaining,
        dayProgressRatio:
          paceData.days.total > 0
            ? Math.round((paceData.days.elapsed / paceData.days.total) * 100) / 100
            : 0,
        surgeCategories: paceData.surgeCategories,
        message: paceData.message,
      },
      giftCards: {
        unredeemedCount: giftCardsData.summary.unredeemedCount,
        unredeemedAmount: giftCardsData.summary.unredeemedAmount,
        unredeemed: giftCardsData.unredeemed.slice(0, 5),
      },
      attention: {
        attentionCount: attentionData.attentionCount,
        urgent: attentionData.urgent,
        brief: attentionData.brief,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? `${err.message} (${err.stack})` : String(err)
    throw new ApiError(500, 'DASHBOARD_ERROR', msg)
  }
}

async function meta(householdId: string) {
  const { data, error } = await db()
    .from('ledger_categories')
    .select('category_major, category_minor, record_rule, category_group, sort_order')
    .order('sort_order', { ascending: true })

  if (error) throw dbError(error)

  return {
    version: '1.0',
    auth: 'Authorization: Bearer <AGENT_API_KEY>',
    transactionTypes: TRANSACTION_TYPES,
    paymentMethods: PAYMENT_METHODS,
    cards: await listCards(householdId),
    aggregationGroups: [
      '수입',
      '생활비',
      '투자납입',
      '투자회수',
      '대출차입',
      '대출상환',
      '집계 제외',
    ],
    balanceColumns: BALANCE_COLUMNS,
    categories: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      categoryMajor: row.category_major,
      categoryMinor: row.category_minor,
      categoryGroup: row.category_group,
      recordRule: row.record_rule,
    })),
    endpoints: {
      dashboard: 'GET /v1/dashboard?month=YYYY-MM',
      insightsAttention: 'GET /v1/insights/attention?month=YYYY-MM',
      giftCardsUnredeemed: 'GET /v1/giftcards/unredeemed?month=YYYY-MM',
      giftCardsCashout: 'POST /v1/giftcards/cashout',
      health: 'GET /v1/health',
      meta: 'GET /v1/meta',
      budget: 'GET/PATCH/PUT /v1/budget (also supports /v1/budgets)',
      cards: 'GET /v1/cards',
      cardsRecommend: 'POST /v1/cards/recommend',
      cardsStatus: 'GET /v1/cards/status?month=YYYY-MM',
      spendingPace: 'GET /v1/insights/pace?month=YYYY-MM',
      transactions: 'GET/POST /v1/transactions',
      transactionsSmartParse: 'POST /v1/transactions/smart-parse',
      transaction: 'GET/PATCH/DELETE /v1/transactions/:id',
      cancel: 'POST /v1/transactions/:id/cancel',
      restore: 'POST /v1/transactions/:id/restore',
      history: 'GET /v1/transactions/:id/history',
      balances: 'GET /v1/balance-snapshots',
      balance: 'GET/PUT /v1/balance-snapshots/:month',
      monthly: 'GET /v1/aggregates/monthly?month=YYYY-MM',
      categoriesAggregate: 'GET /v1/aggregates/categories?month=YYYY-MM',
      fixedExpenses: 'GET/POST /v1/fixed-expenses?month=YYYY-MM',
      fixedExpensesToday: 'GET /v1/fixed-expenses/today?date=YYYY-MM-DD',
      fixedExpensesPending: 'GET /v1/fixed-expenses/pending?month=YYYY-MM',
      fixedExpense: 'GET/PATCH/DELETE /v1/fixed-expenses/:id',
      fixedExpenseApply: 'POST /v1/fixed-expenses/:id/apply',
      fixedExpenseHistory: 'GET /v1/fixed-expenses/:id/history',
    },
  }
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)
  let path = url.pathname

  const marker = '/agent-api'
  const markerIndex = path.indexOf(marker)
  if (markerIndex >= 0) {
    path = path.slice(markerIndex + marker.length) || '/'
  }
  path = path.replace(/\/+$/, '') || '/'

  const method = req.method.toUpperCase()

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (path === '/v1/health' || path === '/health') {
    return jsonResponse({
      ok: true,
      service: 'ssen-ledger-agent-api',
      version: '1.0',
      time: new Date().toISOString(),
    })
  }

  requireApiKey(req)
  const householdId = await resolveHouseholdId()

  if (path === '/v1/meta' && method === 'GET') {
    return dataResponse(await meta(householdId))
  }

  if (path === '/v1/dashboard' && method === 'GET') {
    const month = url.searchParams.get('month')
    return dataResponse(await getDashboard(householdId, month))
  }

  if (
    (path === '/v1/insights/attention' || path === '/v1/attention') &&
    method === 'GET'
  ) {
    const month = url.searchParams.get('month')
    return dataResponse(await getInsightsAttention(householdId, month))
  }

  if (path === '/v1/giftcards/unredeemed' && method === 'GET') {
    const month = url.searchParams.get('month')
    return dataResponse(await getUnredeemedGiftCards(householdId, month))
  }

  if (path === '/v1/giftcards/cashout' && method === 'POST') {
    return cashoutGiftCard(req, householdId)
  }

  if (
    path === '/v1/budget' ||
    path === '/v1/budgets' ||
    path === '/v1/settings'
  ) {
    if (method === 'GET') return getBudget(householdId)
    if (method === 'PATCH') return updateBudget(req, householdId, 'patch')
    if (method === 'PUT') return updateBudget(req, householdId, 'put')
  }

  if (path === '/v1/cards/recommend' && method === 'POST') {
    const body = normalizeAliases(await readBody(req))
    return dataResponse(await recommendCards(householdId, body))
  }

  if (path === '/v1/cards/status' && method === 'GET') {
    const month = url.searchParams.get('month')
    return dataResponse(await getCardsStatus(householdId, month))
  }

  if (path === '/v1/cards' && method === 'GET') {
    return dataResponse(await listCards(householdId))
  }

  if (path === '/v1/transactions/smart-parse' && method === 'POST') {
    const body = await readBody(req)
    const text = String(body.text ?? body.message ?? body.raw ?? '')
    const options: SmartParseOptions = {
      defaultYear: body.defaultYear ? Number(body.defaultYear) : undefined,
      autoRecord: Boolean(body.autoRecord || body.autoCreate || body.record),
      force: Boolean(body.force),
      memo: body.memo ? String(body.memo) : undefined,
      categoryId: body.categoryId ? String(body.categoryId) : undefined,
      cardId: (body.cardId ?? body.cardName ?? body.card)
        ? String(body.cardId ?? body.cardName ?? body.card)
        : undefined,
      paymentMethod: body.paymentMethod ? String(body.paymentMethod) : undefined,
    }
    return dataResponse(await smartParseTransaction(householdId, text, options))
  }

  if (path === '/v1/transactions' && method === 'GET') {
    return listTransactions(req, householdId)
  }

  if (path === '/v1/transactions' && method === 'POST') {
    return createTransaction(req, householdId)
  }

  const historyMatch = path.match(/^\/v1\/transactions\/([^/]+)\/history$/)
  if (historyMatch && method === 'GET') {
    return transactionHistory(householdId, decodeURIComponent(historyMatch[1]))
  }

  const cancelMatch = path.match(/^\/v1\/transactions\/([^/]+)\/cancel$/)
  if (cancelMatch && method === 'POST') {
    return cancelTransaction(
      req,
      householdId,
      decodeURIComponent(cancelMatch[1]),
    )
  }

  const restoreMatch = path.match(/^\/v1\/transactions\/([^/]+)\/restore$/)
  if (restoreMatch && method === 'POST') {
    return restoreTransaction(householdId, decodeURIComponent(restoreMatch[1]))
  }

  const transactionMatch = path.match(/^\/v1\/transactions\/([^/]+)$/)
  if (transactionMatch) {
    const id = decodeURIComponent(transactionMatch[1])
    if (method === 'GET') return getTransaction(req, householdId, id)
    if (method === 'PATCH') return updateTransaction(req, householdId, id)
    if (method === 'DELETE') return cancelTransaction(req, householdId, id)
  }

  if (path === '/v1/balance-snapshots' && method === 'GET') {
    return listBalances(req, householdId)
  }

  const balanceMatch = path.match(/^\/v1\/balance-snapshots\/(\d{4}-\d{2})$/)
  if (balanceMatch) {
    const month = balanceMatch[1]
    if (method === 'GET') return getBalance(householdId, month)
    if (method === 'PUT') return putBalance(req, householdId, month)
  }

  if (
    (path === '/v1/aggregates/monthly' || path === '/v1/aggregates') &&
    method === 'GET'
  ) {
    const month = normalizeMonth(new URL(req.url).searchParams.get('month'))
    return dataResponse(await monthlyAggregate(householdId, month))
  }

  if (path === '/v1/aggregates/categories' && method === 'GET') {
    const month = normalizeMonth(new URL(req.url).searchParams.get('month'))
    const aggregate = await monthlyAggregate(householdId, month)
    return dataResponse({
      month: aggregate.month,
      excludedFromSpend: aggregate.excludedFromSpend,
      byGroup: aggregate.byGroup,
      byType: aggregate.byType,
      byCategory: aggregate.byCategory,
      topExpenses: aggregate.topExpenses,
    })
  }

  if (path === '/v1/fixed-expenses') {
    if (method === 'GET') {
      const month = normalizeMonth(url.searchParams.get('month'))
      const includeInactive =
        url.searchParams.get('includeInactive') === 'true'
      return dataResponse(
        await fixedExpenses(householdId, month, includeInactive),
      )
    }
    if (method === 'POST') {
      return createFixedExpense(req, householdId)
    }
  }

  if (
    (path === '/v1/insights/pace' || path === '/v1/pace') &&
    method === 'GET'
  ) {
    const month = url.searchParams.get('month')
    return dataResponse(await getSpendingPace(householdId, month))
  }

  if (path === '/v1/fixed-expenses/today' && method === 'GET') {
    const date = url.searchParams.get('date')
    const month = url.searchParams.get('month')
    return dataResponse(
      await getFixedExpensesTodayOrPending(householdId, date, month, 'today'),
    )
  }

  if (path === '/v1/fixed-expenses/pending' && method === 'GET') {
    const date = url.searchParams.get('date')
    const month = url.searchParams.get('month')
    return dataResponse(
      await getFixedExpensesTodayOrPending(householdId, date, month, 'pending'),
    )
  }

  const fixedExpenseMatch = path.match(
    /^\/v1\/fixed-expenses\/([^/]+)(\/apply|\/history)?$/,
  )
  if (fixedExpenseMatch) {
    const id = fixedExpenseMatch[1]
    const action = fixedExpenseMatch[2]

    if (action === '/apply' && method === 'POST') {
      return applyFixedExpense(req, householdId, id)
    }
    if (action === '/history' && method === 'GET') {
      return fixedExpenseHistory(householdId, id)
    }
    if (!action && method === 'GET') {
      return dataResponse(toApiFixedExpense(await fetchFixedExpense(householdId, id)))
    }
    if (!action && method === 'PATCH') {
      return updateFixedExpense(req, householdId, id)
    }
    if (!action && method === 'DELETE') {
      return deleteFixedExpense(householdId, id)
    }
  }

  throw new ApiError(404, 'NOT_FOUND', '엔드포인트를 찾을 수 없습니다.')
}

const handler = async (req: Request) => {
  try {
    return await handle(req)
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error)
    }
    console.error(error)
    return errorResponse(
      new ApiError(500, 'INTERNAL_ERROR', '서버 오류가 발생했습니다.'),
    )
  }
}

// Supabase Edge Runtime에서는 포트를 직접 잡지 않고 런타임에 맡깁니다.
// 로컬 테스트에서만 AGENT_API_PORT를 지정합니다.
const localPort = Deno.env.get('AGENT_API_PORT')

if (localPort) {
  Deno.serve({ port: Number(localPort) }, handler)
} else {
  Deno.serve(handler)
}
