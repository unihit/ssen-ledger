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
  '생활비|주거': 'etc',
  '생활비|통신': 'telecom',
  '생활비|생활': 'living',
  '생활비|마트': 'mart',
  '생활비|외식비': 'food',
  '생활비|회사식비': 'food',
  '생활비|건강': 'medical',
  '생활비|교통': 'transport',
  '생활비|경조사': 'etc',
  '생활비|상품권': 'giftcard',
  '생활비|보험료': 'insurance',
  '생활비|회비': 'etc',
  '생활비|기부금': 'etc',
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
}

class ApiError extends Error {
  status: number
  code: string
  fields?: Record<string, string>

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
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
    note: row.note ?? '',
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
    note: input.note,
    status: 'active',
    source: 'muse',
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
    source: 'muse',
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

  const { data, error } = await db()
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .eq('status', 'active')
    .gte('date', range.from)
    .lte('date', range.to)
    .limit(5000)

  if (error) throw dbError(error)

  const rows = annotateRows((data ?? []) as Record<string, unknown>[])
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

  for (const row of rows) {
    const amount = effectiveAmount(row)
    const major = String(row.category_major)
    const minor = String(row.category_minor)
    const group = String(row.category_group)
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
    current.count += 1
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

  const reviewCount = rows.filter(
    (row) => Array.isArray(row.review_alerts) && row.review_alerts.length > 0,
  ).length

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
    transactionCount: rows.length,
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
    note: input.note || null,
    card_id: usesCard ? cardId : null,
    updated_by: 'muse',
  }
}

function toApiFixedExpense(row: Record<string, unknown>) {
  const dayOfMonth = Number(row.day_of_month) || 1
  return {
    id: row.id,
    active: Boolean(row.active),
    name: row.merchant ?? '',
    amount: Number(row.amount) || 0,
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
    note: row.note ?? '',
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
      const suggestedCandidates = !matched && candidateDate
        ? transactions
            .filter(
              (transaction) =>
                !transaction.fixed_expense_id &&
                transaction.date === candidateDate &&
                effectiveAmount(transaction) === Number(row.amount),
            )
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
      health: 'GET /v1/health',
      meta: 'GET /v1/meta',
      cards: 'GET /v1/cards',
      transactions: 'GET/POST /v1/transactions',
      transaction: 'GET/PATCH/DELETE /v1/transactions/:id',
      cancel: 'POST /v1/transactions/:id/cancel',
      restore: 'POST /v1/transactions/:id/restore',
      history: 'GET /v1/transactions/:id/history',
      balances: 'GET /v1/balance-snapshots',
      balance: 'GET/PUT /v1/balance-snapshots/:month',
      monthly: 'GET /v1/aggregates/monthly?month=YYYY-MM',
      categoriesAggregate: 'GET /v1/aggregates/categories?month=YYYY-MM',
      fixedExpenses: 'GET/POST /v1/fixed-expenses?month=YYYY-MM',
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

  if (path === '/v1/cards' && method === 'GET') {
    return dataResponse(await listCards(householdId))
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
