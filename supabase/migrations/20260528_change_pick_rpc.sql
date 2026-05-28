-- ================================================================
-- change_pick RPC
--   마감 전 pending pick의 선수/방식/라운드 변경.
--   포인트/total_picks 재변경 없음 (place_pick에서 이미 처리됨).
--   status='pending'인 row만 변경 가능; locked/settled 변경 불가.
-- ================================================================

CREATE OR REPLACE FUNCTION public.change_pick(
    p_fight_id        TEXT,
    p_matchup_id      UUID,
    p_pick_name       TEXT,
    p_predicted_side  TEXT,
    p_method          TEXT,
    p_predicted_round INTEGER,
    p_odds            NUMERIC,
    p_base_payout     INTEGER,
    p_is_upset        BOOLEAN,
    p_event_id        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id     UUID   := auth.uid();
    v_pick_id     BIGINT;
    v_fighter_idx INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- 마감/결과 입력 체크 (place_pick과 동일 조건)
    IF p_matchup_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.matchups m
        JOIN public.events e ON e.id = m.event_id
        WHERE m.id = p_matchup_id
          AND (
            e.picks_locked_at IS NOT NULL
            OR m.result_status IN ('completed', 'draw', 'no_contest')
          )
    ) THEN
        RAISE EXCEPTION 'pick_locked';
    END IF;

    -- pending 픽 존재 확인
    SELECT id INTO v_pick_id
    FROM public.picks
    WHERE user_id = v_user_id
      AND fight_id = p_fight_id
      AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no_pending_pick';
    END IF;

    -- 픽 변경 (포인트 변경 없음)
    UPDATE public.picks SET
        pick_name       = p_pick_name,
        predicted_side  = p_predicted_side,
        method          = NULLIF(p_method, ''),
        predicted_round = p_predicted_round,
        odds            = p_odds,
        payout          = p_base_payout,
        base_payout     = p_base_payout,
        is_upset        = p_is_upset
    WHERE id = v_pick_id;

    -- 커뮤니티 픽바 갱신 (event_picks upsert)
    IF p_event_id IS NOT NULL AND p_predicted_side IS NOT NULL THEN
        v_fighter_idx := CASE WHEN p_predicted_side = 'red' THEN 0 ELSE 1 END;
        INSERT INTO public.event_picks (user_id, event_id, fight_id, fighter_index)
        VALUES (v_user_id, p_event_id, p_fight_id, v_fighter_idx)
        ON CONFLICT (user_id, fight_id)
        DO UPDATE SET fighter_index = EXCLUDED.fighter_index,
                      event_id      = EXCLUDED.event_id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'pick_id', v_pick_id);
END;
$$;

REVOKE ALL ON FUNCTION public.change_pick FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_pick TO authenticated;
