-- ================================================================
-- admin_delete_matchup 픽타곤 전적 지속성 가드 (record_scope 의존)
--
--   배경: 기존 가드(20260614)는 picks/event_picks/legacy 연결만 보호 → 픽이 전혀 없는
--   fantasy/exhibition 확정 경기를 삭제하면 그 경기로 집계되던 픽타곤 전적이 영구 소실됨.
--   (픽타곤 전적의 영구 원천 = events + matchups; matchup 이 사라지면 파생 집계도 사라짐.)
--
--   조치: 기존 picks/event_picks/legacy 가드를 완전 유지하고, 추가로 대상 matchup 이
--   record_scope ∈ (fantasy, exhibition) 이벤트 소속이며 result_status 가 확정
--   (completed/draw/no_contest)이면 matchup_record_in_use 로 삭제 거부.
--   scheduled 또는 unclassified/official 무연결 matchup 삭제는 기존대로 허용.
--
--   전제: 20260615_event_record_scope_and_picktagon_record.sql 가 먼저 적용되어
--   events.record_scope 가 존재해야 함(파일명 정렬상 event_record_scope 가 선행).
--
--   범위: admin_delete_matchup 본문만 교체. 시그니처/owner/SECDEF/search_path/권한/
--   성공 응답·audit 형식 불변. 다른 함수/데이터 변경 없음.
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_matchup(p_matchup_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_before JSONB;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    -- 대상 matchup 잠금 + 스냅샷 (place_pick/change_pick 의 FOR SHARE 와 충돌 → race 차단).
    SELECT to_jsonb(m) INTO v_before
      FROM public.matchups m
     WHERE m.id = p_matchup_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matchup_not_found';
    END IF;

    -- (1) 연결 데이터 가드(모든 상태): 현행 픽 / 레거시 픽(matchup_id NULL + fight_id) / event_picks.
    IF EXISTS (SELECT 1 FROM public.picks       WHERE matchup_id = p_matchup_id)
       OR EXISTS (SELECT 1 FROM public.picks       WHERE matchup_id IS NULL AND fight_id = p_matchup_id::text)
       OR EXISTS (SELECT 1 FROM public.event_picks WHERE fight_id = p_matchup_id::text)
    THEN
        RAISE EXCEPTION 'matchup_in_use';
    END IF;

    -- (2) 픽타곤 전적 지속성 가드: fantasy/exhibition 이벤트의 확정 결과 matchup 삭제 거부.
    IF EXISTS (
        SELECT 1
          FROM public.matchups m
          JOIN public.events e ON e.id = m.event_id
         WHERE m.id = p_matchup_id
           AND e.record_scope IN ('fantasy', 'exhibition')
           AND m.result_status IN ('completed', 'draw', 'no_contest')
    ) THEN
        RAISE EXCEPTION 'matchup_record_in_use';
    END IF;

    -- 연결/전적 없음 → 삭제(+ matchup_fight_stats CASCADE). 성공 audit 는 기존 형식 그대로.
    DELETE FROM public.matchups WHERE id = p_matchup_id;

    INSERT INTO public.admin_audit_logs (admin_user_id, action, entity_table, entity_id, before_data)
    VALUES (v_uid, 'delete_matchup', 'matchups', p_matchup_id::TEXT, v_before);

    RETURN jsonb_build_object('ok', true);
END;
$$;

ALTER FUNCTION public.admin_delete_matchup(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_delete_matchup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_matchup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_matchup(uuid) TO service_role;
