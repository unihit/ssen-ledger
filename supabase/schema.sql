-- 쎈 가계부 Supabase schema
-- Supabase Dashboard > SQL Editor 에서 전체를 붙여넣고 Run 하세요.
-- 여러 번 실행해도 되도록 작성했습니다.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default '우리 집',
  settings jsonb not null default '{}'::jsonb,
  initialized boolean not null default false,
  created_at timestamptz not null default now()
);

-- 이전 버전 스키마를 이미 실행한 경우를 위한 보강
alter table public.households
  add column if not exists initialized boolean not null default false;

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx
  on public.household_members (user_id);

create table if not exists public.cards (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null,
  name text not null,
  issuer text not null default '',
  kind text not null default 'credit' check (kind in ('credit', 'check')),
  color_from text not null default '#4f8cff',
  color_to text not null default '#1f5ae0',
  min_spend_for_benefits integer not null default 0,
  monthly_total_cap integer not null default 0,
  base_rate numeric(6,4) not null default 0,
  base_cap integer not null default 0,
  benefits jsonb not null default '[]'::jsonb,
  performance_tiers jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

-- 기존 프로젝트에 카드별 전월 실적 구간을 추가합니다.
alter table public.cards
  add column if not exists performance_tiers jsonb not null default '[]'::jsonb;

create table if not exists public.transactions (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null,
  date date not null,
  merchant text not null,
  amount integer not null check (amount >= 0),
  category_id text not null,
  card_id text,
  memo text,
  excluded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id),
  foreign key (household_id, card_id)
    references public.cards(household_id, id)
);

create index if not exists transactions_household_date_idx
  on public.transactions (household_id, date desc);

create index if not exists transactions_household_date_id_idx
  on public.transactions (household_id, date desc, id);

create index if not exists transactions_household_category_idx
  on public.transactions (household_id, category_id);

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cards_touch_updated_at on public.cards;
create trigger cards_touch_updated_at
before update on public.cards
for each row execute function public.touch_updated_at();

drop trigger if exists transactions_touch_updated_at on public.transactions;
create trigger transactions_touch_updated_at
before update on public.transactions
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.cards enable row level security;
alter table public.transactions enable row level security;

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = hid
      and user_id = auth.uid()
  );
$$;

drop policy if exists "households_select" on public.households;
create policy "households_select"
on public.households for select to authenticated
using (public.is_household_member(id));

drop policy if exists "households_update" on public.households;
create policy "households_update"
on public.households for update to authenticated
using (public.is_household_member(id))
with check (public.is_household_member(id));

drop policy if exists "members_select" on public.household_members;
create policy "members_select"
on public.household_members for select to authenticated
using (user_id = auth.uid() or public.is_household_member(household_id));

drop policy if exists "cards_all" on public.cards;
create policy "cards_all"
on public.cards for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "transactions_all" on public.transactions;
create policy "transactions_all"
on public.transactions for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- 4. Household creation RPC
-- ---------------------------------------------------------------------------

create or replace function public.create_household(p_name text default '우리 집')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  -- StrictMode/여러 탭에서 동시에 호출해도 가구가 중복 생성되지 않도록
  -- 같은 사용자에 대해서만 트랜잭션 잠금을 건다.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  select hm.household_id into hid
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = auth.uid()
  order by h.created_at asc
  limit 1;

  if hid is not null then
    return hid;
  end if;

  insert into public.households (name)
  values (coalesce(nullif(trim(p_name), ''), '우리 집'))
  returning id into hid;

  insert into public.household_members (household_id, user_id, role)
  values (hid, auth.uid(), 'owner');

  return hid;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. 가구 삭제 RPC (소유자 전용)
-- 중복 생성된 가구를 정리할 때 사용합니다. 카드/결제/멤버도 함께 삭제됩니다.
-- ---------------------------------------------------------------------------

create or replace function public.delete_household(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    raise exception '가구 소유자만 삭제할 수 있습니다.';
  end if;

  delete from public.households where id = p_household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 원자적 전체 교체 RPC
-- JSON 가져오기/초기 상태 되돌리기/첫 마이그레이션을 한 트랜잭션으로 처리합니다.
-- 중간에 실패하면 기존 클라우드 데이터가 그대로 남습니다.
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

  delete from public.transactions where household_id = p_household_id;
  delete from public.cards where household_id = p_household_id;

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
  );

  insert into public.transactions (
    household_id, id, date, merchant, amount, category_id, card_id, memo, excluded
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
    coalesce(t.excluded, false)
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
  );

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
-- 7. Data API grants
-- "Automatically expose new tables"를 OFF로 설정한 경우 필요합니다.
-- 앱은 로그인 후에만 쓰므로 anon에는 테이블 권한을 주지 않습니다.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

revoke all on table
  public.households,
  public.household_members,
  public.cards,
  public.transactions
from anon;

grant select, insert, update, delete
on table
  public.households,
  public.household_members,
  public.cards,
  public.transactions
to authenticated;

revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.create_household(text) from public;
revoke all on function public.delete_household(uuid) from public;
revoke all on function public.replace_household_state(uuid, jsonb, jsonb, jsonb) from public;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.delete_household(uuid) to authenticated;
grant execute on function public.replace_household_state(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Realtime
-- ---------------------------------------------------------------------------

alter table public.transactions replica identity full;
alter table public.cards replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cards'
  ) then
    alter publication supabase_realtime add table public.cards;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'households'
  ) then
    alter publication supabase_realtime add table public.households;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'recurring_expenses'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'recurring_expenses'
  ) then
    alter publication supabase_realtime add table public.recurring_expenses;
  end if;
end;
$$;

-- PostgREST가 새 컬럼/함수를 즉시 인식하도록 스키마 캐시를 새로고침합니다.
notify pgrst, 'reload schema';
