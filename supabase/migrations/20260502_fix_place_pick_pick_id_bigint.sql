-- ================================================================
-- Fix: place_pick v_pick_id UUID → BIGINT
--   picks.id is bigint (autoincrement), not uuid.
--   RETURNING id INTO v_pick_id was failing with
--   "invalid input syntax for type uuid: <bigint_value>".
-- ================================================================

CREATE OR REPLACE FUNCTION public.place_pick(
    p_fight_id       TEXT,
    p_matchup_id     UUID,
    p_pick_name      TEXT,
    p_predicted_side TEXT,
    p_method         TEXT,
    p_predicted_round INTEGER,
    p_odds           NUMERIC,
    p_base_payout    INTEGER,
    p_bet_cost       INTEGER,
    p_is_upset       BOOLEAN,
    p_event_id       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id     UUID    := auth.uid();
    v_points      INTEGER;
    v_new_points  INTEGER;
    v_pick_id     BIGINT;
    v_fighter_idx INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT points INTO v_points
    FROM public.users
    WHERE id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;

    IF COALESCE(v_points, 0) < p_bet_cost THEN
        RAISE EXCEPTION 'insufficient_points';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.picks
        WHERE user_id = v_user_id
          AND fight_id = p_fight_id
          AND status IN ('pending', 'win', 'lose')
    ) THEN
        RAISE EXCEPTION 'duplicate_pick';
    END IF;

    IF p_matchup_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.picks
        WHERE user_id   = v_user_id
          AND matchup_id = p_matchup_id
          AND status IN ('pending', 'win', 'lose')
    ) THEN
        RAISE EXCEPTION 'duplicate_pick';
    END IF;

    -- 픽 마감 체크: 이벤트 픽이 잠겼거나 matchup에 이미 결과가 입력된 경우 픽 금지
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

    v_new_points := COALESCE(v_points, 0) - p_bet_cost;
    UPDATE public.users
    SET
        points      = v_new_points,
        total_picks = COALESCE(total_picks, 0) + 1
    WHERE id = v_user_id;

    INSERT INTO public.picks (
        user_id, fight_id, match_name, pick_name, method, predicted_round,
        odds, bet_cost, payout, base_payout, is_upset, status, matchup_id, predicted_side
    ) VALUES (
        v_user_id, p_fight_id, p_pick_name, p_pick_name, NULLIF(p_method, ''), p_predicted_round,
        p_odds, p_bet_cost, p_base_payout, p_base_payout, p_is_upset, 'pending', p_matchup_id, p_predicted_side
    )
    RETURNING id INTO v_pick_id;

    IF p_event_id IS NOT NULL AND p_predicted_side IS NOT NULL THEN
        v_fighter_idx := CASE WHEN p_predicted_side = 'red' THEN 0 ELSE 1 END;
        INSERT INTO public.event_picks (user_id, event_id, fight_id, fighter_index)
        VALUES (v_user_id, p_event_id, p_fight_id, v_fighter_idx)
        ON CONFLICT (user_id, fight_id)
        DO UPDATE SET fighter_index = EXCLUDED.fighter_index, event_id = EXCLUDED.event_id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'pick_id', v_pick_id, 'new_points', v_new_points);
END;
$$;
