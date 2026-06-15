-- ================================================================
-- admin_delete_matchup 데이터 무결성 가드 (단일 함수 보강)
--
--   배경(2026-06-14 감사): admin_delete_matchup 은 matchups 1행만 raw DELETE 하고
--   의존 데이터 처리는 전적으로 FK 에 의존했음.
--     • picks.matchup_id → matchups 는 FK(NO ACTION) → 연결 픽이 있으면 DELETE 가
--       Postgres foreign_key_violation(23503) 로 실패. 데이터 손실은 없으나 관리자에게
--       원시 FK 오류가 그대로 노출(깨끗한 거부 메시지 없음).
--     • event_picks.fight_id / picks.fight_id 는 FK 없는 "문자열 연결" → 삭제가 성공하는
--       경우(matchup_id-NULL 레거시 픽만 있거나 event_picks 만 있을 때) event_picks 가
--       고아로 남음(미보호 갭).
--
--   조치: 기존 시그니처/반환/성공 audit 형식을 그대로 두고, 삭제 전에 의존 데이터를
--   "모든 상태"로 검사해 하나라도 있으면 matchup_in_use 로 명확히 거부. 대상 matchup 을
--   FOR UPDATE 로 잠가(place_pick/change_pick 의 FOR SHARE 와 충돌) 검사-삭제 사이의
--   동시 픽 삽입(TOCTOU)을 차단. matchup_fight_stats 만 연결된 경우는 기존 FK CASCADE 로
--   함께 삭제(허용). 거부 시 audit 미기록(RAISE → 트랜잭션 롤백)은 현행 정책 유지.
--
--   범위: admin_delete_matchup 함수 1개 본문 교체 + 권한 정리(PUBLIC/anon EXECUTE 회수).
--   admin_delete_event / 프론트 / 기존 고아 데이터 / 다른 함수는 변경 없음.
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

    -- 대상 matchup 잠금 + 스냅샷.
    --   FOR UPDATE 는 place_pick/change_pick 이 픽 삽입 전 동일 matchup 행에 거는 FOR SHARE
    --   와 상호 충돌 → 검사~삭제 구간에 신규 픽/event_picks 가 끼어들 수 없음(race 차단).
    SELECT to_jsonb(m) INTO v_before
      FROM public.matchups m
     WHERE m.id = p_matchup_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matchup_not_found';
    END IF;

    -- 연결 데이터 검사 (pending/win/lose/cancelled 등 모든 상태 포함):
    --   1) 현행 픽(matchup_id 연결)
    --   2) 레거시 픽(matchup_id NULL + fight_id 문자열 연결)
    --   3) event_picks(fight_id 문자열 연결; FK 없음 → 고아화 방지)
    -- matchup_fight_stats 는 검사 대상이 아니므로 통과 → DELETE 시 FK CASCADE 로 함께 정리.
    IF EXISTS (SELECT 1 FROM public.picks       WHERE matchup_id = p_matchup_id)
       OR EXISTS (SELECT 1 FROM public.picks       WHERE matchup_id IS NULL AND fight_id = p_matchup_id::text)
       OR EXISTS (SELECT 1 FROM public.event_picks WHERE fight_id = p_matchup_id::text)
    THEN
        RAISE EXCEPTION 'matchup_in_use';
    END IF;

    -- 연결 없음 → 삭제(+ matchup_fight_stats CASCADE). 성공 audit 는 기존 형식 그대로.
    DELETE FROM public.matchups WHERE id = p_matchup_id;

    INSERT INTO public.admin_audit_logs (admin_user_id, action, entity_table, entity_id, before_data)
    VALUES (v_uid, 'delete_matchup', 'matchups', p_matchup_id::TEXT, v_before);

    RETURN jsonb_build_object('ok', true);
END;
$$;

ALTER FUNCTION public.admin_delete_matchup(uuid) OWNER TO postgres;

-- 권한: PUBLIC/anon EXECUTE 회수, authenticated/service_role 유지(내부 private.is_admin() 게이트).
REVOKE ALL ON FUNCTION public.admin_delete_matchup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_matchup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_matchup(uuid) TO service_role;
