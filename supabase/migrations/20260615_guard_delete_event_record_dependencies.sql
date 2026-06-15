-- ================================================================
-- admin_delete_event 픽타곤 전적 지속성 가드 (record_scope 의존)
--
--   배경: admin_delete_matchup 은 개별 대진 삭제를 가드(20260615_guard_delete_matchup_...)
--   하지만, 이벤트 단위 삭제(admin_delete_event)는 이벤트 소속 matchups 를 통째로 지움.
--   fantasy/exhibition 이벤트의 확정(completed/draw/no_contest) matchup 은 픽타곤 전적의
--   영구 원천이므로, 픽이 전혀 없어(=기존 settled-pick 가드 미발동) 이벤트를 삭제하면
--   그 경기로 집계되던 픽타곤 전적이 영구 소실됨.
--
--   조치: 라이브 admin_delete_event 본문(환급·삭제 순서·audit·반환)을 그대로 보존하고,
--   기존 차단(event_already_finalized) 뒤에 이벤트 소속 matchups 잠금을 둔 다음,
--   기존 settled-pick 차단과 신규 픽타곤 전적 가드를 잠금 확보 상태에서 검사한다.
--   픽타곤 전적 가드 발동 조건:
--     • event.record_scope ∈ (fantasy, exhibition)
--     • 해당 event 에 result_status ∈ (completed, draw, no_contest) matchup 이 1건이라도 존재
--   → event_record_in_use 로 거부(환급/삭제/audit 0).
--   scheduled 만 있는 fantasy/exhibition 이벤트는 기존 삭제 흐름 허용.
--   official/unclassified 이벤트는 픽타곤 전적 가드 미적용 = 기존 삭제 동작 유지.
--
--   동시성(deadlock-free 직렬화): 단순 비잠금 EXISTS 가드는 in-flight 정산과 race 가능하고,
--   대기형 FOR UPDATE 는 정산(matchup→event)과 삭제(event→matchup)의 역방향 잠금으로
--   deadlock 을 유발할 수 있다. deadlock 을 정상 방어 수단으로 쓰지 않기 위해, 본 가드는
--   event 행 FOR UPDATE 와 finalized 검사 직후 이벤트 소속 모든 matchups 를 결정적 순서(id)로
--   FOR UPDATE NOWAIT 잠근다.
--     • event 행 FOR UPDATE 가 신규 matchup 의 FK 삽입(부모 행 FOR KEY SHARE 요구, FOR UPDATE 와
--       충돌)을 이미 차단 → 잠글 matchup 집합이 고정되어 누락 없이 전수 잠금 가능.
--     • 정산(service_settle_matchup)·place_pick 이 해당 matchup 잠금을 선점 중이면 NOWAIT 가
--       대기 없이 즉시 중단 → lock_not_available(55P03) → event_busy_retry 로 변환해 호출측
--       재시도를 유도. 교차 대기/deadlock 자체가 성립하지 않음.
--     • 반대로 삭제가 matchups 잠금을 먼저 확보하면 정산/place_pick 은 해당 matchup 에서 대기 →
--       삭제 트랜잭션 종료(커밋/롤백) 후 진행. 부분 삭제·부분 정산 없음.
--     • 잠금 범위는 해당 이벤트의 행들로 한정(전역 테이블 락 아님).
--   따라서 fantasy/exhibition 뿐 아니라 official/unclassified 이벤트도 진행 중 정산과의
--   삭제 race 에서 동일하게 보호된다(잠금은 record_scope 무관, 전수 적용).
--
--   전제: 20260615_event_record_scope_and_picktagon_record.sql 가 먼저 적용되어
--   events.record_scope 가 존재해야 함.
--
--   범위: admin_delete_event 본문만 교체. 시그니처/owner/SECDEF/search_path/성공 응답·
--   audit·환급 로직 불변. ACL 은 라이브 기준선(authenticated/service_role)을 보존하되
--   PUBLIC/anon 은 제거(라이브에 잔존하던 anon EXECUTE 과대부여 정리). service_settle_matchup
--   등 다른 함수/데이터 변경 없음.
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid            UUID := auth.uid();
    v_event          RECORD;
    v_before         JSONB;
    v_matchups_snap  JSONB;
    v_pick           RECORD;
    v_settled_count  INT;
    v_refund_count   INT := 0;
    v_picks_count    INT;
    v_ep_count       INT;
    v_matchup_count  INT;
BEGIN
    IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

    SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;

    -- settled / archived 이벤트 삭제 차단 (matchups 잠금 이전)
    IF v_event.status IN ('settled', 'archived') THEN
        RAISE EXCEPTION 'event_already_finalized';
    END IF;

    -- ── 동시성 직렬화: 이벤트 소속 모든 matchups 를 결정적 순서로 NOWAIT 잠금 ──
    -- record_scope 무관 전수 잠금. event 행 FOR UPDATE 가 신규 matchup FK 삽입을 차단하므로
    -- 대상 집합 고정. 정산/place_pick 이 선점 중이면 대기 없이 즉시 event_busy_retry.
    BEGIN
        PERFORM 1
          FROM public.matchups
         WHERE event_id = p_event_id
         ORDER BY id
         FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
        RAISE EXCEPTION 'event_busy_retry';
    END;

    -- 정산된 pick이 하나라도 있으면 삭제 차단 (matchups 잠금 확보 후 안정된 스냅샷에서 검사)
    SELECT COUNT(*) INTO v_settled_count
    FROM public.picks p
    JOIN public.matchups m ON m.id = p.matchup_id
    WHERE m.event_id = p_event_id
      AND p.status IN ('win', 'lose', 'cancelled');

    IF v_settled_count > 0 THEN
        RAISE EXCEPTION 'event_has_settled_picks';
    END IF;

    -- ── 픽타곤 전적 지속성 가드 (record_scope 의존, destructive 작업 앞) ──
    -- 이미 전수 잠금된 matchups 위에서 확정 상태를 검사 → in-flight 정산과 무관하게 안정.
    IF v_event.record_scope IN ('fantasy', 'exhibition') THEN
        IF EXISTS (
            SELECT 1 FROM public.matchups
             WHERE event_id = p_event_id
               AND result_status IN ('completed', 'draw', 'no_contest')
        ) THEN
            RAISE EXCEPTION 'event_record_in_use';
        END IF;
    END IF;

    -- 삭제 전 스냅샷
    SELECT to_jsonb(e) INTO v_before FROM public.events e WHERE id = p_event_id;
    SELECT jsonb_agg(to_jsonb(m)) INTO v_matchups_snap
    FROM public.matchups m WHERE event_id = p_event_id;

    -- 1. pending pick bet_cost 환급
    FOR v_pick IN
        SELECT p.*
        FROM public.picks p
        JOIN public.matchups m ON m.id = p.matchup_id
        WHERE m.event_id = p_event_id AND p.status = 'pending'
        FOR UPDATE OF p
    LOOP
        UPDATE public.users
        SET points = COALESCE(points, 0) + COALESCE(v_pick.bet_cost, 0)
        WHERE id = v_pick.user_id;
        v_refund_count := v_refund_count + 1;
    END LOOP;

    -- 2. event_picks 삭제 (event_id는 TEXT 컬럼)
    DELETE FROM public.event_picks WHERE event_id = p_event_id::TEXT;
    GET DIAGNOSTICS v_ep_count = ROW_COUNT;

    -- 3. picks 삭제
    DELETE FROM public.picks p
    USING public.matchups m
    WHERE p.matchup_id = m.id AND m.event_id = p_event_id;
    GET DIAGNOSTICS v_picks_count = ROW_COUNT;

    -- 4. matchups 삭제
    DELETE FROM public.matchups WHERE event_id = p_event_id;
    GET DIAGNOSTICS v_matchup_count = ROW_COUNT;

    -- 5. event 삭제
    DELETE FROM public.events WHERE id = p_event_id;

    -- audit log
    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, metadata)
    VALUES (
        v_uid, 'delete_event', 'events', p_event_id::TEXT,
        v_before,
        jsonb_build_object(
            'deleted_matchups_count',    v_matchup_count,
            'deleted_picks_count',       v_picks_count,
            'deleted_event_picks_count', v_ep_count,
            'refunded_picks_count',      v_refund_count,
            'deleted_matchups',          COALESCE(v_matchups_snap, '[]'::JSONB)
        )
    );

    RETURN jsonb_build_object(
        'ok',              true,
        'deleted_matchups', v_matchup_count,
        'deleted_picks',    v_picks_count,
        'refunded_picks',   v_refund_count
    );
END;
$$;

ALTER FUNCTION public.admin_delete_event(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_delete_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_event(uuid) TO service_role;
