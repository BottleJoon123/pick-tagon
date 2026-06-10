-- ============================================================================
-- Canonical accuracy for leaderboard RPCs + season HOF snapshot
--
-- Official policy: accuracy = win / (win + lose) * 100 (ROUND, integer),
-- pending/cancelled excluded, win+lose = 0 -> NULL. users.total_picks is a
-- participation count and must NOT be used as the accuracy denominator.
--
-- Baseline = live pg_get_functiondef (2026-06-11). Only the accuracy expressions
-- (and the zero-settled handling) change. Signatures, RETURNS types, LANGUAGE,
-- volatility, SECURITY DEFINER, search_path, ownership and EXECUTE grants are all
-- preserved (CREATE OR REPLACE keeps owner + ACL).
--
--   1. admin_end_season       — HOF accuracy from picks win/(win+lose), not
--                               success_picks/total_picks. total_picks/success_picks
--                               snapshot columns keep their existing meaning. All
--                               other behaviour (top3 select, points reset, new
--                               season, audit) is byte-for-byte preserved.
--                               season_hof currently has 0 rows -> no backfill.
--   2. get_leaderboard_v2     — settled_picks = 0 -> accuracy NULL (was 0).
--   3. get_my_leaderboard_context — nearby zero-settled accuracy NULL (was 0);
--                               nearby objects also expose settled_picks/wins/losses.
--   4. get_leaderboard_summary — overall settled = 0 -> avg_accuracy NULL (was 0);
--                               pooled SUM(wins)/SUM(wins+losses) method unchanged.
-- ============================================================================

-- 1. ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_end_season(p_next_season_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_next_name     TEXT    := TRIM(COALESCE(p_next_season_name, ''));
    v_season        RECORD;
    v_cur_num       INTEGER;
    v_new_name      TEXT;
    v_top3          JSONB;
    v_before        JSONB;
    v_new_season_id INTEGER;
    v_affected      INTEGER;
    v_uid           UUID    := auth.uid();
BEGIN
    IF NOT private.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'admin_required');
    END IF;

    SELECT * INTO v_season
    FROM public.seasons
    WHERE is_active = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'no_active_season');
    END IF;

    SELECT to_jsonb(s) INTO v_before FROM public.seasons s WHERE id = v_season.id;

    IF v_next_name = '' THEN
        v_cur_num  := COALESCE(
            (regexp_match(v_season.name, '\d+'))[1]::INTEGER, 1
        );
        v_new_name := 'Season ' || (v_cur_num + 1);
    ELSE
        v_new_name := v_next_name;
    END IF;

    INSERT INTO public.season_hof (
        season_id, rank, user_id, nickname,
        points, total_picks, success_picks, accuracy, belt, faction_id
    )
    SELECT
        v_season.id,
        ROW_NUMBER() OVER (
            ORDER BY u.points DESC, u.success_picks DESC, u.total_picks DESC
        )::INTEGER AS rank,
        u.id,
        COALESCE(u.nickname, '익명'),
        u.points,
        COALESCE(u.total_picks, 0),
        COALESCE(u.success_picks, 0),
        -- accuracy = canonical win/(win+lose) from picks (pending/cancelled 제외, 정산 0건 NULL).
        -- total_picks/success_picks 스냅샷 컬럼 의미는 그대로 유지.
        CASE WHEN (pk.wins + pk.losses) = 0 THEN NULL
             ELSE ROUND(pk.wins::NUMERIC / (pk.wins + pk.losses) * 100)::INTEGER
        END,
        CASE
            WHEN u.points > 10000 THEN 'Black'
            WHEN u.points > 5000  THEN 'Brown'
            WHEN u.points > 2000  THEN 'Purple'
            WHEN u.points > 1000  THEN 'Blue'
            ELSE                       'White'
        END,
        u.faction_id
    FROM (
        SELECT id, nickname, points, total_picks, success_picks, faction_id
        FROM public.users
        ORDER BY points DESC, success_picks DESC, total_picks DESC
        LIMIT 3
    ) u
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) FILTER (WHERE p.status = 'win')  AS wins,
            COUNT(*) FILTER (WHERE p.status = 'lose') AS losses
        FROM public.picks p
        WHERE p.user_id = u.id
    ) pk ON TRUE
    ON CONFLICT (season_id, rank) DO NOTHING;

    UPDATE public.seasons
    SET is_active = FALSE,
        end_date  = CURRENT_DATE
    WHERE id = v_season.id;

    INSERT INTO public.seasons (name, start_date, is_active)
    VALUES (v_new_name, CURRENT_DATE, TRUE)
    RETURNING id INTO v_new_season_id;

    UPDATE public.users SET points = 1000;
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    SELECT jsonb_agg(
        jsonb_build_object(
            'rank',     h.rank,
            'nickname', h.nickname,
            'points',   h.points,
            'accuracy', h.accuracy,
            'belt',     h.belt
        ) ORDER BY h.rank
    ) INTO v_top3
    FROM public.season_hof h
    WHERE h.season_id = v_season.id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, metadata)
    VALUES (
        v_uid,
        'end_season',
        'seasons',
        v_season.id::TEXT,
        v_before,
        jsonb_build_object(
            'ended_season_id',      v_season.id,
            'ended_season_name',    v_season.name,
            'new_season_id',        v_new_season_id,
            'new_season_name',      v_new_name,
            'reset_points_to',      1000,
            'affected_users_count', v_affected,
            'top3',                 COALESCE(v_top3, '[]'::JSONB)
        )
    );

    RETURN jsonb_build_object(
        'ok',           true,
        'ended_season', v_season.name,
        'new_season',   v_new_name,
        'top3',         COALESCE(v_top3, '[]'::JSONB)
    );
END;
$function$;

-- 2. ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_leaderboard_v2(p_limit integer DEFAULT 50)
 RETURNS TABLE(rank bigint, user_id uuid, nickname text, faction_id integer, faction_emoji text, faction_name text, belt text, points integer, settled_picks integer, wins integer, losses integer, accuracy integer, percentile integer, movement integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH latest_key AS (
    SELECT s.snapshot_key
    FROM public.user_rank_snapshots s
    ORDER BY s.captured_at DESC
    LIMIT 1
  ),
  prev AS (
    SELECT s.user_id, s.rank AS prev_rank
    FROM public.user_rank_snapshots s
    JOIN latest_key lk ON lk.snapshot_key = s.snapshot_key
  ),
  agg AS (
    SELECT
      u.id                                                       AS id,
      COALESCE(NULLIF(u.nickname, ''), 'UNKNOWN')                AS nickname,
      COALESCE(u.points, 0)                                      AS points,
      u.faction_id                                               AS faction_id,
      f.emoji_icon                                               AS faction_emoji,
      f.name                                                     AS faction_name,
      COUNT(p.id) FILTER (WHERE p.status = 'win')                AS wins,
      COUNT(p.id) FILTER (WHERE p.status = 'lose')               AS losses
    FROM public.users u
    LEFT JOIN public.factions f ON f.id = u.faction_id
    LEFT JOIN public.picks    p ON p.user_id = u.id
    GROUP BY u.id, u.nickname, u.points, u.faction_id, f.emoji_icon, f.name
  ),
  ranked AS (
    SELECT
      RANK() OVER (ORDER BY a.points DESC)  AS rank,
      COUNT(*) OVER ()                      AS total_users,
      a.id, a.nickname, a.points, a.faction_id, a.faction_emoji, a.faction_name,
      a.wins, a.losses,
      (a.wins + a.losses)                   AS settled_picks
    FROM agg a
  )
  SELECT
    r.rank::BIGINT                                              AS rank,
    r.id                                                       AS user_id,
    r.nickname                                                 AS nickname,
    r.faction_id::INTEGER                                      AS faction_id,
    r.faction_emoji                                            AS faction_emoji,
    r.faction_name                                             AS faction_name,
    CASE
      WHEN r.points <= 1000  THEN 'White'
      WHEN r.points <= 2000  THEN 'Blue'
      WHEN r.points <= 5000  THEN 'Purple'
      WHEN r.points <= 10000 THEN 'Brown'
      ELSE 'Black'
    END                                                        AS belt,
    r.points::INTEGER                                          AS points,
    r.settled_picks::INTEGER                                   AS settled_picks,
    r.wins::INTEGER                                            AS wins,
    r.losses::INTEGER                                          AS losses,
    -- 정산 0건이면 NULL(화면 '—'); 0% 금지.
    CASE WHEN r.settled_picks = 0 THEN NULL
         ELSE ROUND(r.wins::NUMERIC / r.settled_picks * 100)::INTEGER
    END                                                        AS accuracy,
    CASE WHEN r.total_users <= 1 THEN 100
         ELSE ROUND((r.total_users - r.rank)::NUMERIC / (r.total_users - 1) * 100)::INTEGER
    END                                                        AS percentile,
    CASE WHEN pr.prev_rank IS NULL THEN NULL
         ELSE (pr.prev_rank - r.rank)::INTEGER
    END                                                        AS movement
  FROM ranked r
  LEFT JOIN prev pr ON pr.user_id = r.id
  ORDER BY r.rank ASC, r.points DESC
  LIMIT p_limit;
$function$;

-- 3. ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_leaderboard_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid           uuid := auth.uid();
  v_total         integer;
  v_rank          bigint;
  v_points        integer;
  v_belt          text;
  v_above_points  integer;
  v_next_belt     text;
  v_next_belt_min integer;
  v_nearby        jsonb;
  v_form          jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.users;

  WITH agg AS (
    SELECT u.id, COALESCE(u.points, 0) AS points
    FROM public.users u
  ),
  ranked AS (
    SELECT id, points, RANK() OVER (ORDER BY points DESC) AS rank
    FROM agg
  )
  SELECT r.rank, r.points,
         CASE
           WHEN r.points <= 1000  THEN 'White'
           WHEN r.points <= 2000  THEN 'Blue'
           WHEN r.points <= 5000  THEN 'Purple'
           WHEN r.points <= 10000 THEN 'Brown'
           ELSE 'Black'
         END
    INTO v_rank, v_points, v_belt
  FROM ranked r
  WHERE r.id = v_uid;

  IF v_rank IS NULL THEN
    RETURN jsonb_build_object(
      'my_rank', NULL, 'total_users', v_total, 'percentile', NULL,
      'my_points', NULL, 'my_belt', NULL, 'next_belt', NULL,
      'next_belt_points', NULL, 'points_to_next_belt', NULL,
      'points_to_next_rank', NULL,
      'nearby_rankers', '[]'::jsonb, 'recent_form', '[]'::jsonb
    );
  END IF;

  SELECT MIN(COALESCE(u.points, 0)) INTO v_above_points
  FROM public.users u
  WHERE COALESCE(u.points, 0) > v_points;

  v_next_belt := CASE v_belt
    WHEN 'White'  THEN 'Blue'
    WHEN 'Blue'   THEN 'Purple'
    WHEN 'Purple' THEN 'Brown'
    WHEN 'Brown'  THEN 'Black'
    ELSE NULL END;
  v_next_belt_min := CASE v_belt
    WHEN 'White'  THEN 1001
    WHEN 'Blue'   THEN 2001
    WHEN 'Purple' THEN 5001
    WHEN 'Brown'  THEN 10001
    ELSE NULL END;

  WITH agg AS (
    SELECT u.id, COALESCE(NULLIF(u.nickname, ''), 'UNKNOWN') AS nickname,
           COALESCE(u.points, 0) AS points, u.faction_id,
           f.name AS faction_name, f.emoji_icon AS faction_emoji,
           COUNT(p.id) FILTER (WHERE p.status = 'win')  AS wins,
           COUNT(p.id) FILTER (WHERE p.status = 'lose') AS losses
    FROM public.users u
    LEFT JOIN public.factions f ON f.id = u.faction_id
    LEFT JOIN public.picks    p ON p.user_id = u.id
    GROUP BY u.id, u.nickname, u.points, u.faction_id, f.name, f.emoji_icon
  ),
  ranked AS (
    SELECT RANK() OVER (ORDER BY points DESC) AS rank,
           id, nickname, points, faction_id, faction_name, faction_emoji,
           wins, losses, (wins + losses) AS settled_picks,
           -- 정산 0건이면 NULL(화면 '—'); 0% 금지.
           CASE WHEN (wins + losses) = 0 THEN NULL
                ELSE ROUND(wins::numeric / (wins + losses) * 100)::int END AS accuracy,
           CASE
             WHEN points <= 1000  THEN 'White'
             WHEN points <= 2000  THEN 'Blue'
             WHEN points <= 5000  THEN 'Purple'
             WHEN points <= 10000 THEN 'Brown'
             ELSE 'Black'
           END AS belt
    FROM agg
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'rank', r.rank, 'user_id', r.id, 'nickname', r.nickname,
             'points', r.points, 'belt', r.belt,
             'faction_id', r.faction_id, 'faction_name', r.faction_name,
             'faction_emoji', r.faction_emoji, 'accuracy', r.accuracy,
             'settled_picks', r.settled_picks, 'wins', r.wins, 'losses', r.losses,
             'is_me', (r.id = v_uid)
           ) ORDER BY r.rank
         ), '[]'::jsonb)
    INTO v_nearby
  FROM ranked r
  WHERE r.rank BETWEEN v_rank - 2 AND v_rank + 2;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'status',     t.status,
             'matchup_id', t.matchup_id,
             'label',      t.label,
             'settled_at', t.settled_at,
             'payout',     t.payout
           ) ORDER BY t.settled_at DESC NULLS LAST
         ), '[]'::jsonb)
    INTO v_form
  FROM (
    SELECT CASE WHEN p.status = 'win' THEN 'W' ELSE 'L' END AS status,
           p.matchup_id, p.match_name AS label, p.settled_at,
           p.settled_payout AS payout
    FROM public.picks p
    WHERE p.user_id = v_uid AND p.status IN ('win', 'lose')
    ORDER BY p.settled_at DESC NULLS LAST
    LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'my_rank',             v_rank,
    'total_users',         v_total,
    'percentile',          CASE WHEN v_total <= 1 THEN 100
                                ELSE ROUND((v_total - v_rank)::numeric / (v_total - 1) * 100)::int END,
    'my_points',           v_points,
    'my_belt',             v_belt,
    'next_belt',           v_next_belt,
    'next_belt_points',    v_next_belt_min,
    'points_to_next_belt', CASE WHEN v_next_belt_min IS NULL THEN 0
                                ELSE GREATEST(v_next_belt_min - v_points, 0) END,
    'points_to_next_rank', COALESCE(v_above_points - v_points, 0),
    'nearby_rankers',      v_nearby,
    'recent_form',         v_form
  );
END;
$function$;

-- 4. ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_leaderboard_summary()
 RETURNS TABLE(total_users integer, ranked_users integer, belt_distribution jsonb, avg_accuracy integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH agg AS (
    SELECT
      u.id                                            AS id,
      COALESCE(u.points, 0)                           AS points,
      COUNT(p.id) FILTER (WHERE p.status = 'win')     AS wins,
      COUNT(p.id) FILTER (WHERE p.status = 'lose')    AS losses
    FROM public.users u
    LEFT JOIN public.picks p ON p.user_id = u.id
    GROUP BY u.id, u.points
  )
  SELECT
    COUNT(*)::INTEGER                                  AS total_users,
    COUNT(*) FILTER (WHERE points > 0)::INTEGER        AS ranked_users,
    jsonb_build_object(
      'white',  COUNT(*) FILTER (WHERE points <= 1000),
      'blue',   COUNT(*) FILTER (WHERE points > 1000  AND points <= 2000),
      'purple', COUNT(*) FILTER (WHERE points > 2000  AND points <= 5000),
      'brown',  COUNT(*) FILTER (WHERE points > 5000  AND points <= 10000),
      'black',  COUNT(*) FILTER (WHERE points > 10000)
    )                                                  AS belt_distribution,
    -- 전체 정산 0건이면 NULL(0% 금지). pooled SUM(wins)/SUM(wins+losses) 방식 유지.
    CASE
      WHEN SUM(wins + losses) = 0 THEN NULL
      ELSE ROUND(SUM(wins)::NUMERIC / SUM(wins + losses) * 100)::INTEGER
    END                                                AS avg_accuracy
  FROM agg;
$function$;
