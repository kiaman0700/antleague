-- 040: 기권한 사람에게 저장된 업적을 지움
-- 기권을 무시하고 재산만 보면 현금만 들고 기권해도 '투자왕'·'존버의 미학' 등을 받을 수 있음.
-- 코드는 computeAchievements 의 left 로 막고, 이미 기록된 결과에서 left=true 인 사람의 badges 를 빈 목록으로.
-- 여러 번 실행해도 안전 (이미 비어 있으면 그대로)
update public.match_history h
set results = (
  select jsonb_agg(
    case when coalesce((e->>'left')::boolean, false) and jsonb_array_length(coalesce(e->'badges', '[]'::jsonb)) > 0
      then jsonb_set(e, '{badges}', '[]'::jsonb)
      else e
    end
    order by ord
  )
  from jsonb_array_elements(h.results) with ordinality as t(e, ord)
)
where jsonb_typeof(h.results) = 'array'
  and exists (
    select 1 from jsonb_array_elements(h.results) e
    where coalesce((e->>'left')::boolean, false) and jsonb_array_length(coalesce(e->'badges', '[]'::jsonb)) > 0
  );
