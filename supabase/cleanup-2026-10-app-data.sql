-- 2026년 10월 앱 데이터 소프트 취소
-- 시트 거래를 이관한 뒤, 기존 앱에서 생성된 10월 활성 거래만 취소합니다.
-- 하드 삭제하지 않으며 ledger_history에 변경 이력이 남습니다.

with target as (
  select household_id, id
  from public.transactions
  where household_id = (
      select id
      from public.households
      order by created_at
      limit 1
    )
    and date >= '2026-10-01'
    and date < '2026-11-01'
    and source = 'app'
    and status = 'active'
),
updated as (
  update public.transactions t
  set status = 'canceled',
      canceled_at = coalesce(t.canceled_at, now()),
      cancel_reason = coalesce(t.cancel_reason, '시트 이관 전 10월 앱 데이터 정리'),
      updated_by = 'app'
  from target
  where t.household_id = target.household_id
    and t.id = target.id
  returning t.id
)
select count(*) as canceled_count
from updated;
