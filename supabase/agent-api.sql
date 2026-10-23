-- 쎈 가계부 · Muse / Agent REST API용 스키마 확장
-- supabase/schema.sql을 먼저 실행한 뒤, 이 파일을 Supabase SQL Editor에서 실행하세요.
-- 여러 번 실행해도 되도록 작성했습니다.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0. 기존 앱 카테고리 -> 시트 소분류 매핑
-- ---------------------------------------------------------------------------

create or replace function public.app_category_to_sheet_minor(p_category_id text)
returns text
language sql
immutable
as $$
  select case p_category_id
    when 'food' then '외식비'
    when 'cafe' then '카페'
    when 'mart' then '마트'
    when 'delivery' then '외식비'
    when 'shopping' then '의복/미용'
    when 'simplepay' then '기타'
    when 'transport' then '교통'
    when 'fuel' then '자동차'
    when 'telecom' then '통신'
    when 'subscription' then '구독'
    when 'travel' then '기타'
    when 'culture' then '게임'
    when 'medical' then '건강'
    when 'living' then '생활'
    when 'education' then '기타'
    when 'etc' then '기타'
    else '기타'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 1. transactions 확장
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column if not exists category_major text not null default '생활비',
  add column if not exists category_minor text not null default '기타',
  add column if not exists category_group text not null default '생활비',
  add column if not exists correction integer not null default 0,
  add column if not exists payment_method text,
  add column if not exists note text,
  add column if not exists status text not null default 'active',
  add column if not exists canceled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists source text not null default 'app',
  add column if not exists created_by text not null default 'app',
  add column if not exists updated_by text not null default 'app',
  add column if not exists fixed_expense_id uuid,
  add column if not exists fixed_expense_month date;

alter table public.transactions
  add column if not exists effective_amount integer generated always as (amount + correction) stored;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_category_major_check'
  ) then
    alter table public.transactions
      add constraint transactions_category_major_check
      check (category_major in ('수입', '생활비', '투자납입', '투자회수', '대출차입', '대출상환', '계좌이체'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_category_group_check'
  ) then
    alter table public.transactions
      add constraint transactions_category_group_check
      check (category_group in ('수입', '생활비', '투자납입', '투자회수', '대출차입', '대출상환', '집계 제외'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_status_check'
  ) then
    alter table public.transactions
      add constraint transactions_status_check
      check (status in ('active', 'canceled'));
  end if;
end $$;

create index if not exists transactions_household_status_date_idx
  on public.transactions (household_id, status, date desc);

create index if not exists transactions_household_sheet_category_idx
  on public.transactions (household_id, category_major, category_minor);

-- 고정지출 한 건은 한 달에 한 번만 활성 거래로 남깁니다.
-- 취소된 거래는 인덱스 대상에서 빠지므로, 다시 반영할 수 있습니다.
create unique index if not exists transactions_fixed_expense_month_uidx
  on public.transactions (household_id, fixed_expense_id, fixed_expense_month)
  where fixed_expense_id is not null
    and fixed_expense_month is not null
    and status = 'active';

-- 기존 앱 거래를 시트 구조로 백필합니다.
update public.transactions
set
  category_major = '생활비',
  category_minor = public.app_category_to_sheet_minor(category_id),
  category_group = '생활비',
  created_by = coalesce(created_by, 'app'),
  updated_by = coalesce(updated_by, 'app')
where source = 'app'
  and category_major = '생활비'
  and (category_minor is null or category_minor = '기타');

update public.transactions t
set payment_method = case
  when t.card_id is null then '현금'
  else coalesce(
    (
      select case when c.kind = 'check' then '체크카드' else '신용카드' end
      from public.cards c
      where c.household_id = t.household_id
        and c.id = t.card_id
    ),
    '기타'
  )
end
where t.payment_method is null
  and t.source = 'app'
  and coalesce(t.category_major, '생활비') = '생활비';

-- ---------------------------------------------------------------------------
-- 2. 분류 기준
-- ---------------------------------------------------------------------------

create table if not exists public.ledger_categories (
  id bigserial primary key,
  category_major text not null,
  category_minor text not null,
  record_rule text not null default '',
  category_group text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (category_major, category_minor)
);

alter table public.ledger_categories enable row level security;

drop policy if exists "ledger_categories_select" on public.ledger_categories;
create policy "ledger_categories_select"
on public.ledger_categories for select to authenticated
using (true);

insert into public.ledger_categories (category_major, category_minor, record_rule, category_group, sort_order) values
  ('수입', '급여', '실제 생활 수입. 원금 회수·대출금 제외', '수입', 1),
  ('수입', '수당', '실제 생활 수입. 원금 회수·대출금 제외', '수입', 2),
  ('수입', '배당·이자', '실제 생활 수입. 원금 회수·대출금 제외', '수입', 3),
  ('수입', '기타수입', '실제 생활 수입. 원금 회수·대출금 제외', '수입', 4),
  ('생활비', '주거', '실제 소비. 대출 원금·투자납입 제외', '생활비', 5),
  ('생활비', '통신', '실제 소비. 대출 원금·투자납입 제외', '생활비', 6),
  ('생활비', '생활', '실제 소비. 대출 원금·투자납입 제외', '생활비', 7),
  ('생활비', '마트', '실제 소비. 대출 원금·투자납입 제외', '생활비', 8),
  ('생활비', '외식비', '실제 소비. 대출 원금·투자납입 제외', '생활비', 9),
  ('생활비', '회사식비', '실제 소비. 대출 원금·투자납입 제외', '생활비', 10),
  ('생활비', '건강', '실제 소비. 대출 원금·투자납입 제외', '생활비', 11),
  ('생활비', '교통', '실제 소비. 대출 원금·투자납입 제외', '생활비', 12),
  ('생활비', '경조사', '실제 소비. 대출 원금·투자납입 제외', '생활비', 13),
  ('생활비', '상품권', '실제 소비. 대출 원금·투자납입 제외', '생활비', 14),
  ('생활비', '보험료', '실제 소비. 대출 원금·투자납입 제외', '생활비', 15),
  ('생활비', '회비', '실제 소비. 대출 원금·투자납입 제외', '생활비', 16),
  ('생활비', '기부금', '실제 소비. 대출 원금·투자납입 제외', '생활비', 17),
  ('생활비', '의복/미용', '실제 소비. 대출 원금·투자납입 제외', '생활비', 18),
  ('생활비', '카페', '실제 소비. 대출 원금·투자납입 제외', '생활비', 19),
  ('생활비', '자동차', '실제 소비. 대출 원금·투자납입 제외', '생활비', 20),
  ('생활비', '대출이자', '실제 소비. 대출 원금·투자납입 제외', '생활비', 21),
  ('생활비', '차입금이자', '실제 소비. 대출 원금·투자납입 제외', '생활비', 22),
  ('생활비', '구독', '실제 소비. 대출 원금·투자납입 제외', '생활비', 23),
  ('생활비', '기타', '실제 소비. 대출 원금·투자납입 제외', '생활비', 24),
  ('생활비', '게임', '실제 소비. 대출 원금·투자납입 제외', '생활비', 25),
  ('투자납입', '예적금', '생활자금에서 투자계좌로 넣은 순수 신규자금', '투자납입', 26),
  ('투자납입', 'IRP·연금', '생활자금에서 투자계좌로 넣은 순수 신규자금', '투자납입', 27),
  ('투자납입', 'ISA', '생활자금에서 투자계좌로 넣은 순수 신규자금', '투자납입', 28),
  ('투자납입', '국내주식', '생활자금에서 투자계좌로 넣은 순수 신규자금', '투자납입', 29),
  ('투자납입', '해외주식', '생활자금에서 투자계좌로 넣은 순수 신규자금', '투자납입', 30),
  ('투자납입', '기타투자', '생활자금에서 투자계좌로 넣은 순수 신규자금', '투자납입', 31),
  ('투자회수', '예적금', '투자계좌에서 생활자금으로 회수한 금액', '투자회수', 32),
  ('투자회수', 'IRP·연금', '투자계좌에서 생활자금으로 회수한 금액', '투자회수', 33),
  ('투자회수', 'ISA', '투자계좌에서 생활자금으로 회수한 금액', '투자회수', 34),
  ('투자회수', '국내주식', '투자계좌에서 생활자금으로 회수한 금액', '투자회수', 35),
  ('투자회수', '해외주식', '투자계좌에서 생활자금으로 회수한 금액', '투자회수', 36),
  ('투자회수', '기타투자', '투자계좌에서 생활자금으로 회수한 금액', '투자회수', 37),
  ('대출차입', '마이너스통장', '새로 빌린 원금. 수입에 중복 입력 금지', '대출차입', 38),
  ('대출차입', '가족차입', '새로 빌린 원금. 수입에 중복 입력 금지', '대출차입', 39),
  ('대출차입', '기타대출', '새로 빌린 원금. 수입에 중복 입력 금지', '대출차입', 40),
  ('대출상환', '마이너스통장', '갚은 원금. 이자는 생활비로 별도 입력', '대출상환', 41),
  ('대출상환', '가족차입', '갚은 원금. 이자는 생활비로 별도 입력', '대출상환', 42),
  ('대출상환', '차입원금상환', '갚은 원금. 이자는 생활비로 별도 입력', '대출상환', 43),
  ('대출상환', '기타대출', '갚은 원금. 이자는 생활비로 별도 입력', '대출상환', 44),
  ('계좌이체', '본인계좌이체', '본인 생활계좌 사이 이동. 수입·지출 집계 제외', '집계 제외', 45)
on conflict (category_major, category_minor) do update set
  record_rule = excluded.record_rule,
  category_group = excluded.category_group,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 3. 월말 잔액 스냅샷
-- ---------------------------------------------------------------------------

create table if not exists public.balance_snapshots (
  household_id uuid not null references public.households(id) on delete cascade,
  month date not null,
  cash_account integer,
  securities_krw integer,
  foreign_cash_krw integer,
  overdraft_used integer,
  family_loan integer,
  other_loan integer,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null default 'app',
  updated_by text not null default 'app',
  primary key (household_id, month),
  check (extract(day from month) = 1)
);

create index if not exists balance_snapshots_household_month_idx
  on public.balance_snapshots (household_id, month desc);

alter table public.balance_snapshots enable row level security;

drop policy if exists "balance_snapshots_all" on public.balance_snapshots;
create policy "balance_snapshots_all"
on public.balance_snapshots for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop trigger if exists balance_snapshots_touch_updated_at on public.balance_snapshots;
create trigger balance_snapshots_touch_updated_at
before update on public.balance_snapshots
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. 고정지출 / 반복거래
-- ---------------------------------------------------------------------------

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  active boolean not null default true,
  start_month date,
  end_month date,
  day_of_month integer not null,
  category_major text not null,
  category_minor text not null,
  category_group text not null,
  category_id text,
  card_id text,
  amount integer not null check (amount >= 0),
  merchant text,
  memo text,
  payment_method text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null default 'app',
  updated_by text not null default 'app',
  check (day_of_month between 1 and 31),
  check (start_month is null or extract(day from start_month) = 1),
  check (end_month is null or extract(day from end_month) = 1)
);

-- 이전 버전의 recurring_expenses 테이블을 위한 보강
alter table public.recurring_expenses
  add column if not exists category_id text,
  add column if not exists card_id text;

create index if not exists recurring_expenses_household_active_idx
  on public.recurring_expenses (household_id, active, start_month, end_month);

create index if not exists recurring_expenses_card_idx
  on public.recurring_expenses (household_id, card_id)
  where card_id is not null;

alter table public.recurring_expenses enable row level security;

drop policy if exists "recurring_expenses_all" on public.recurring_expenses;
create policy "recurring_expenses_all"
on public.recurring_expenses for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop trigger if exists recurring_expenses_touch_updated_at on public.recurring_expenses;
create trigger recurring_expenses_touch_updated_at
before update on public.recurring_expenses
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. 변경 이력
-- ---------------------------------------------------------------------------

create table if not exists public.ledger_history (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  entity_type text not null check (entity_type in ('transaction', 'balance_snapshot', 'recurring_expense')),
  entity_id text not null,
  action text not null check (action in ('created', 'updated', 'canceled', 'restored', 'hard_deleted')),
  before_data jsonb,
  after_data jsonb,
  changed_by text,
  created_at timestamptz not null default now()
);

create index if not exists ledger_history_entity_idx
  on public.ledger_history (household_id, entity_type, entity_id, created_at desc);

alter table public.ledger_history enable row level security;

drop policy if exists "ledger_history_select" on public.ledger_history;
create policy "ledger_history_select"
on public.ledger_history for select to authenticated
using (public.is_household_member(household_id));

create or replace function public.log_ledger_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_type text;
  v_entity_id text;
  v_action text;
  v_before jsonb;
  v_after jsonb;
  v_actor text;
  v_household_id uuid;
begin
  if tg_table_name = 'transactions' then
    v_entity_type := 'transaction';
  elsif tg_table_name = 'balance_snapshots' then
    v_entity_type := 'balance_snapshot';
  elsif tg_table_name = 'recurring_expenses' then
    v_entity_type := 'recurring_expense';
  else
    raise exception '지원하지 않는 이력 테이블입니다: %', tg_table_name;
  end if;

  if tg_op = 'DELETE' then
    v_household_id := old.household_id;
    if v_entity_type in ('transaction', 'recurring_expense') then
      v_entity_id := old.id::text;
    else
      v_entity_id := to_char(old.month, 'YYYY-MM');
    end if;
  else
    v_household_id := new.household_id;
    if v_entity_type in ('transaction', 'recurring_expense') then
      v_entity_id := new.id::text;
    else
      v_entity_id := to_char(new.month, 'YYYY-MM');
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_action := 'created';
    v_before := null;
    v_after := to_jsonb(new);
    v_actor := coalesce(new.created_by, new.updated_by, auth.uid()::text, 'system');
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    if v_entity_type = 'transaction' then
      if old.status = 'active' and new.status = 'canceled' then
        v_action := 'canceled';
      elsif old.status = 'canceled' and new.status = 'active' then
        v_action := 'restored';
      else
        v_action := 'updated';
      end if;
    else
      v_action := 'updated';
    end if;
    v_actor := coalesce(new.updated_by, new.created_by, auth.uid()::text, 'system');
  else
    v_action := 'hard_deleted';
    v_before := to_jsonb(old);
    v_after := null;
    v_actor := coalesce(old.updated_by, old.created_by, auth.uid()::text, 'system');
  end if;

  insert into public.ledger_history (
    household_id, entity_type, entity_id, action, before_data, after_data, changed_by
  ) values (
    v_household_id, v_entity_type, v_entity_id, v_action, v_before, v_after, v_actor
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_log_ledger_history on public.transactions;
create trigger transactions_log_ledger_history
after insert or update or delete on public.transactions
for each row execute function public.log_ledger_history();

drop trigger if exists balance_snapshots_log_ledger_history on public.balance_snapshots;
create trigger balance_snapshots_log_ledger_history
after insert or update or delete on public.balance_snapshots
for each row execute function public.log_ledger_history();

drop trigger if exists recurring_expenses_log_ledger_history on public.recurring_expenses;
create trigger recurring_expenses_log_ledger_history
after insert or update or delete on public.recurring_expenses
for each row execute function public.log_ledger_history();

-- ---------------------------------------------------------------------------
-- 6. 기존 전체 교체 RPC를 소프트 취소 방식으로 변경
-- ---------------------------------------------------------------------------

create or replace function public.replace_household_state(
  p_household_id uuid,
  p_cards jsonb,
  p_transactions jsonb,
  p_settings jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_household_member(p_household_id) then
    raise exception '이 가구에 접근할 수 없습니다.';
  end if;

  -- 앱이 관리하는 생활비 거래만 취소합니다.
  -- API로 들어온 수입·투자·대출·계좌이체 거래는 그대로 보존합니다.
  update public.transactions
  set
    status = 'canceled',
    canceled_at = coalesce(canceled_at, now()),
    cancel_reason = coalesce(cancel_reason, '전체 교체'),
    updated_by = 'app'
  where household_id = p_household_id
    and status = 'active'
    and coalesce(category_major, '생활비') = '생활비';

  -- 카드 삭제 전에 취소 거래의 카드 참조를 해제합니다.
  update public.transactions
  set card_id = null
  where household_id = p_household_id
    and status = 'canceled';

  -- API 거래나 고정지출이 참조하는 카드는 남기고, 참조가 없는 카드만 삭제합니다.
  delete from public.cards c
  where c.household_id = p_household_id
    and not exists (
      select 1
      from public.transactions t
      where t.household_id = c.household_id
        and t.card_id = c.id
    )
    and not exists (
      select 1
      from public.recurring_expenses r
      where r.household_id = c.household_id
        and r.card_id = c.id
    );

  insert into public.cards (
    household_id, id, name, issuer, kind, color_from, color_to,
    min_spend_for_benefits, monthly_total_cap, base_rate, base_cap,
    benefits, performance_tiers, active
  )
  select
    p_household_id,
    c.id,
    coalesce(nullif(c.name, ''), '카드'),
    coalesce(c.issuer, ''),
    case when c.kind in ('credit', 'check') then c.kind else 'credit' end,
    coalesce(nullif(c.color_from, ''), '#4f8cff'),
    coalesce(nullif(c.color_to, ''), '#1f5ae0'),
    coalesce(c.min_spend_for_benefits, 0),
    coalesce(c.monthly_total_cap, 0),
    coalesce(c.base_rate, 0),
    coalesce(c.base_cap, 0),
    coalesce(c.benefits, '[]'::jsonb),
    coalesce(c.performance_tiers, '[]'::jsonb),
    coalesce(c.active, true)
  from jsonb_to_recordset(
    case when jsonb_typeof(p_cards) = 'array' then p_cards else '[]'::jsonb end
  ) as c(
    id text,
    name text,
    issuer text,
    kind text,
    color_from text,
    color_to text,
    min_spend_for_benefits integer,
    monthly_total_cap integer,
    base_rate numeric,
    base_cap integer,
    benefits jsonb,
    performance_tiers jsonb,
    active boolean
  )
  on conflict (household_id, id) do update set
    name = excluded.name,
    issuer = excluded.issuer,
    kind = excluded.kind,
    color_from = excluded.color_from,
    color_to = excluded.color_to,
    min_spend_for_benefits = excluded.min_spend_for_benefits,
    monthly_total_cap = excluded.monthly_total_cap,
    base_rate = excluded.base_rate,
    base_cap = excluded.base_cap,
    benefits = excluded.benefits,
    performance_tiers = excluded.performance_tiers,
    active = excluded.active,
    updated_at = now();

  insert into public.transactions (
    household_id, id, date, merchant, amount, category_id, card_id, memo, excluded,
    category_major, category_minor, category_group, correction, payment_method, note,
    status, source, created_by, updated_by
  )
  select
    p_household_id,
    t.id,
    t.date,
    t.merchant,
    t.amount,
    t.category_id,
    t.card_id,
    t.memo,
    coalesce(t.excluded, false),
    '생활비',
    public.app_category_to_sheet_minor(t.category_id),
    '생활비',
    0,
    case when t.card_id is null then '현금' else '신용카드' end,
    null,
    'active',
    'app',
    'app',
    'app'
  from jsonb_to_recordset(
    case when jsonb_typeof(p_transactions) = 'array' then p_transactions else '[]'::jsonb end
  ) as t(
    id text,
    date date,
    merchant text,
    amount integer,
    category_id text,
    card_id text,
    memo text,
    excluded boolean
  )
  on conflict (household_id, id) do update set
    date = excluded.date,
    merchant = excluded.merchant,
    amount = excluded.amount,
    category_id = excluded.category_id,
    card_id = excluded.card_id,
    memo = excluded.memo,
    excluded = excluded.excluded,
    category_major = excluded.category_major,
    category_minor = excluded.category_minor,
    category_group = excluded.category_group,
    correction = 0,
    payment_method = excluded.payment_method,
    status = 'active',
    canceled_at = null,
    cancel_reason = null,
    source = 'app',
    updated_by = 'app',
    updated_at = now();

  update public.households
  set settings = case
        when jsonb_typeof(p_settings) = 'object' then p_settings
        else '{}'::jsonb
      end,
      initialized = true
  where id = p_household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. 권한
-- ---------------------------------------------------------------------------

revoke all on table
  public.ledger_categories,
  public.balance_snapshots,
  public.recurring_expenses,
  public.ledger_history
from anon;

grant select on table public.ledger_categories to authenticated;
grant select, insert, update, delete on table public.balance_snapshots to authenticated;
grant select, insert, update, delete on table public.recurring_expenses to authenticated;
grant select on table public.ledger_history to authenticated;

-- Edge Function은 service_role로 PostgREST에 접근합니다.
grant usage on schema public to service_role;
grant select on table
  public.households,
  public.ledger_categories,
  public.cards,
  public.ledger_history
to service_role;
grant select, insert, update on table
  public.recurring_expenses,
  public.transactions,
  public.balance_snapshots
to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke all on function public.app_category_to_sheet_minor(text) from public;
revoke all on function public.log_ledger_history() from public;

grant execute on function public.app_category_to_sheet_minor(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. PostgREST 스키마 캐시 갱신
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
