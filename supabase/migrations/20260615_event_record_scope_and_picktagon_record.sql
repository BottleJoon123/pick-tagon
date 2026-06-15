-- ================================================================
-- 공식 전적 ↔ 픽타곤 전적 분리 (events.record_scope + 파생 집계 RPC)
--
--   정책:
--     • fighters.wins/losses/draws 는 외부 공식 전적 전용 — 본 작업/RPC 어디서도 미수정.
--     • events.record_scope 로 이벤트를 분류: unclassified(기본) / official / fantasy / exhibition.
--     • 픽타곤 전적 = record_scope ∈ (fantasy, exhibition) 이벤트의 settled matchups 만 fighter_id
--       기준으로 파생 집계(read-only). unclassified/official 은 절대 미포함(공식 sync 와 이중계상 방지).
--     • 영구 원천 = events + matchups (archive_fights 는 fighter_id/winner_side/result_status 부재 →
--       집계 불가). archived 이벤트는 admin_delete_event(차단)·admin_delete_matchup(가드)로 보존됨.
--     • FREEDOM 250(데모/판타지)만 명시 백필. source_url 기반 일괄 official 백필 금지. 나머지는 unclassified.
--
--   범위: events 컬럼 1개 추가 + FREEDOM 250 1행 백필 + read RPC 1개(INVOKER) + admin write RPC 1개
--   (DEFINER+is_admin). fighters/matchups/picks/정산·sync 로직 미변경.
-- ================================================================

-- ── A. events.record_scope ──────────────────────────────────────
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS record_scope text NOT NULL DEFAULT 'unclassified';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.events'::regclass AND conname = 'events_record_scope_check'
    ) THEN
        ALTER TABLE public.events
            ADD CONSTRAINT events_record_scope_check
            CHECK (record_scope IN ('unclassified', 'official', 'fantasy', 'exhibition'));
    END IF;
END $$;

-- FREEDOM 250(데모/판타지)만 정확한 UUID 로 백필. 그 외 이벤트는 unclassified 유지.
UPDATE public.events
   SET record_scope = 'fantasy'
 WHERE id = 'bf300955-a088-4789-b73c-3ec99effe3d3'
   AND record_scope <> 'fantasy';

-- ── B. 픽타곤 전적 파생 집계 (read-only, SECURITY INVOKER) ───────
--   fantasy/exhibition 이벤트의 확정 결과만 집계. 정확성 규칙:
--     • 한 선수는 한 matchup 에서 red XOR blue → CASE 로 side 1개만 산출(단일 패스) →
--       matchup 당 정확히 1행만 생성(중복 집계 구조적 불가).
--     • red_fighter_id = blue_fighter_id 인 비정상 self-matchup 은 전부 제외.
--     • completed 는 result_winner_side IN ('red','blue') 인 경우만 W/L/total 집계.
--       completed 인데 winner_side 가 NULL/비정상이면 outcome=NULL → W/L/total 모두 제외.
--     • draw → D, no_contest → NC.  total = 실제 집계된 결과(outcome NOT NULL) 수.
--     • 현재 result_winner_side 로 판정 → force 재정산/승자 변경 자동 반영.
--       official/unclassified 는 record_scope 필터로 구조적 제외.
CREATE OR REPLACE FUNCTION public.get_fighter_picktagon_record(p_fighter_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    WITH mm AS (
        -- matchup 당 정확히 1행: 선수가 red 면 'red', blue 면 'blue'
        SELECT m.id,
               CASE WHEN m.red_fighter_id  = p_fighter_id THEN 'red'
                    WHEN m.blue_fighter_id = p_fighter_id THEN 'blue' END AS side,
               m.result_status,
               m.result_winner_side
          FROM public.matchups m
          JOIN public.events e ON e.id = m.event_id
         WHERE e.record_scope IN ('fantasy', 'exhibition')
           AND m.result_status IN ('completed', 'draw', 'no_contest')
           AND (m.red_fighter_id = p_fighter_id OR m.blue_fighter_id = p_fighter_id)
           AND m.red_fighter_id IS DISTINCT FROM m.blue_fighter_id   -- self-matchup 제외
    ),
    classified AS (
        SELECT
            CASE
                WHEN result_status = 'draw'       THEN 'D'
                WHEN result_status = 'no_contest' THEN 'NC'
                WHEN result_status = 'completed' AND result_winner_side IN ('red', 'blue')
                     AND result_winner_side = side THEN 'W'
                WHEN result_status = 'completed' AND result_winner_side IN ('red', 'blue')
                     AND result_winner_side <> side THEN 'L'
                ELSE NULL   -- completed + winner_side NULL/비정상 → 제외
            END AS outcome
          FROM mm
    )
    SELECT jsonb_build_object(
        'fighter_id', p_fighter_id,
        'win',   COALESCE(SUM((outcome = 'W')::int), 0),
        'lose',  COALESCE(SUM((outcome = 'L')::int), 0),
        'draw',  COALESCE(SUM((outcome = 'D')::int), 0),
        'nc',    COALESCE(SUM((outcome = 'NC')::int), 0),
        'total', COALESCE(SUM((outcome IS NOT NULL)::int), 0)
    )
    FROM classified;
$$;

-- 공개 데이터(로그인 무관). INVOKER 이므로 호출자는 matchups/events SELECT 권한 필요(anon/authenticated 보유).
REVOKE ALL ON FUNCTION public.get_fighter_picktagon_record(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fighter_picktagon_record(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_fighter_picktagon_record(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fighter_picktagon_record(text) TO service_role;

-- ── C. 관리자 분류 변경 (SECURITY DEFINER + is_admin) ────────────
CREATE OR REPLACE FUNCTION public.admin_set_event_record_scope(p_event_id uuid, p_scope text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_before TEXT;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;
    IF p_scope NOT IN ('unclassified', 'official', 'fantasy', 'exhibition') THEN
        RAISE EXCEPTION 'invalid_record_scope';
    END IF;

    SELECT record_scope INTO v_before FROM public.events WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'event_not_found';
    END IF;

    -- 동일 값이면 변경 없음: UPDATE/audit 미수행(idempotent).
    IF v_before IS NOT DISTINCT FROM p_scope THEN
        RETURN jsonb_build_object('ok', true, 'idempotent', true, 'record_scope', p_scope);
    END IF;

    UPDATE public.events SET record_scope = p_scope WHERE id = p_event_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (
        v_uid, 'set_event_record_scope', 'events', p_event_id::TEXT,
        jsonb_build_object('record_scope', v_before),
        jsonb_build_object('record_scope', p_scope)
    );

    RETURN jsonb_build_object('ok', true, 'idempotent', false, 'record_scope', p_scope);
END;
$$;

ALTER FUNCTION public.admin_set_event_record_scope(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_set_event_record_scope(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_event_record_scope(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_event_record_scope(uuid, text) TO service_role;
