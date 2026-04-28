-- height_cm / reach_cm (numeric) → height / reach (text) 일괄 backfill
-- height_cm 697행, reach_cm 695행이 이미 존재하나 text 컬럼은 비어있음

begin;

-- height: "170 cm" 형식으로 채움 (NULL이거나 빈 문자열인 행만)
update public.fighters
set height = ROUND(height_cm)::text || ' cm'
where height_cm is not null
  and (height is null or height = '');

-- reach: "185 cm" 형식으로 채움 (NULL이거나 빈 문자열인 행만)
update public.fighters
set reach = ROUND(reach_cm)::text || ' cm'
where reach_cm is not null
  and (reach is null or reach = '');

commit;
