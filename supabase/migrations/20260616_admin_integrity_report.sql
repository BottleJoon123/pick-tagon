-- ================================================================
-- 운영 무결성 대시보드 1차: 관리자 전용 read-only 점검 RPC
--
--   admin_integrity_report() — DB/운영 데이터 이상징후 7종을 한 번에 집계해 jsonb 반환.
--   • SECURITY DEFINER + private.is_admin() 게이트(비관리자 admin_required).
--     picks/event_picks/users 는 RLS(본인 행만)라 client 교차집계 불가 → DEFINER 로 서버 집계.
--   • STABLE, 본문은 SELECT only(INSERT/UPDATE/DELETE 없음). 운영 데이터 미변경.
--   • user_id/email 등 식별정보 반환 금지(카운트·이벤트 title/date·fight_id·status 분포만).
--   • owner=postgres, search_path 고정. PUBLIC/anon EXECUTE 회수, authenticated/service_role 허용.
--
--   점검 항목: orphan_event_picks / legacy_picks / archive_unlinked / unclassified_events /
--              event_state_mismatch / user_count_drift / recap_uncomputable_picks.
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_integrity_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    RETURN jsonb_build_object(
        'generated_at', now(),

        -- 1) 고아 event_picks: fight_id 가 어떤 matchups.id 에도 매칭되지 않음
        'orphan_event_picks', jsonb_build_object(
            'count', (SELECT count(*) FROM public.event_picks ep
                       WHERE NOT EXISTS (SELECT 1 FROM public.matchups m WHERE m.id::text = ep.fight_id)),
            'total', (SELECT count(*) FROM public.event_picks),
            'samples', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('fight_id', fight_id, 'event_id', event_id))
                FROM (SELECT ep.fight_id, ep.event_id FROM public.event_picks ep
                       WHERE NOT EXISTS (SELECT 1 FROM public.matchups m WHERE m.id::text = ep.fight_id)
                       ORDER BY ep.fight_id LIMIT 10) s
            ), '[]'::jsonb)
        ),

        -- 2) 레거시 picks: matchup_id IS NULL (fight_id 연결 가능/불가, status 분포)
        'legacy_picks', jsonb_build_object(
            'count', (SELECT count(*) FROM public.picks WHERE matchup_id IS NULL),
            'linkable', (SELECT count(*) FROM public.picks p WHERE p.matchup_id IS NULL
                          AND EXISTS (SELECT 1 FROM public.matchups m WHERE m.id::text = p.fight_id)),
            'unlinkable', (SELECT count(*) FROM public.picks p WHERE p.matchup_id IS NULL
                            AND NOT EXISTS (SELECT 1 FROM public.matchups m WHERE m.id::text = p.fight_id)),
            'by_status', COALESCE((SELECT jsonb_object_agg(status, c)
                FROM (SELECT status, count(*) c FROM public.picks WHERE matchup_id IS NULL GROUP BY status) s), '{}'::jsonb)
        ),

        -- 3) archive_events.source_event_id IS NULL (title/date/reason)
        'archive_unlinked', jsonb_build_object(
            'count', (SELECT count(*) FROM public.archive_events WHERE source_event_id IS NULL),
            'rows', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('title', name, 'date', event_date, 'reason', reason) ORDER BY name)
                FROM (
                    SELECT ae.name, ae.event_date,
                        CASE
                            WHEN ae.event_date IS NULL THEN 'null_date'
                            WHEN (SELECT count(*) FROM public.events e
                                   WHERE lower(btrim(regexp_replace(coalesce(e.title,''),'\s+',' ','g')))
                                       = lower(btrim(regexp_replace(coalesce(ae.name,''),'\s+',' ','g')))
                                     AND e.event_date::date = ae.event_date) = 0 THEN 'no_match'
                            WHEN (SELECT count(*) FROM public.events e
                                   WHERE lower(btrim(regexp_replace(coalesce(e.title,''),'\s+',' ','g')))
                                       = lower(btrim(regexp_replace(coalesce(ae.name,''),'\s+',' ','g')))
                                     AND e.event_date::date = ae.event_date) > 1 THEN 'multi_event'
                            ELSE 'archive_collision'
                        END AS reason
                    FROM public.archive_events ae WHERE ae.source_event_id IS NULL
                    LIMIT 50
                ) s
            ), '[]'::jsonb)
        ),

        -- 4) unclassified events (finalized 우선)
        'unclassified_events', jsonb_build_object(
            'count', (SELECT count(*) FROM public.events WHERE record_scope = 'unclassified'),
            'finalized_count', (SELECT count(*) FROM public.events
                                 WHERE record_scope = 'unclassified' AND status IN ('archived','settled','completed')),
            'by_status', COALESCE((SELECT jsonb_object_agg(status, c)
                FROM (SELECT status, count(*) c FROM public.events WHERE record_scope='unclassified' GROUP BY status) s), '{}'::jsonb),
            'finalized', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('title', title, 'date', event_date::date, 'status', status) ORDER BY event_date DESC)
                FROM public.events WHERE record_scope='unclassified' AND status IN ('archived','settled','completed')
            ), '[]'::jsonb)
        ),

        -- 5) 이벤트 상태 불일치
        'event_state_mismatch', jsonb_build_object(
            'count', (
                (SELECT count(*) FROM (
                    SELECT e.id FROM public.events e JOIN public.matchups m ON m.event_id=e.id
                     WHERE e.status IN ('archived','settled','completed')
                     GROUP BY e.id
                    HAVING count(*) FILTER (WHERE m.result_status IS NULL OR m.result_status NOT IN ('completed','draw','no_contest')) > 0) a)
              + (SELECT count(*) FROM (
                    SELECT e.id FROM public.events e JOIN public.matchups m ON m.event_id=e.id
                     WHERE e.status IN ('upcoming','live')
                     GROUP BY e.id
                    HAVING count(*) FILTER (WHERE m.result_status IN ('completed','draw','no_contest')) > 0) b)
            ),
            'finalized_with_unsettled', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('title', title, 'status', status, 'unsettled', cnt) ORDER BY title)
                FROM (
                    SELECT e.id, e.title, e.status,
                           count(*) FILTER (WHERE m.result_status IS NULL OR m.result_status NOT IN ('completed','draw','no_contest')) AS cnt
                    FROM public.events e JOIN public.matchups m ON m.event_id=e.id
                    WHERE e.status IN ('archived','settled','completed')
                    GROUP BY e.id, e.title, e.status
                    HAVING count(*) FILTER (WHERE m.result_status IS NULL OR m.result_status NOT IN ('completed','draw','no_contest')) > 0
                ) s), '[]'::jsonb),
            'upcoming_with_completed', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('title', title, 'status', status, 'completed', cnt) ORDER BY title)
                FROM (
                    SELECT e.id, e.title, e.status,
                           count(*) FILTER (WHERE m.result_status IN ('completed','draw','no_contest')) AS cnt
                    FROM public.events e JOIN public.matchups m ON m.event_id=e.id
                    WHERE e.status IN ('upcoming','live')
                    GROUP BY e.id, e.title, e.status
                    HAVING count(*) FILTER (WHERE m.result_status IN ('completed','draw','no_contest')) > 0
                ) s), '[]'::jsonb)
        ),

        -- 6) 포인트/픽 카운트 drift (식별정보 없이 카운트·최대 편차만)
        'user_count_drift', jsonb_build_object(
            'users_total', (SELECT count(*) FROM public.users),
            'total_picks_drift_users', (SELECT count(*) FROM (
                SELECT COALESCE(u.total_picks,0) - COALESCE(a.total,0) AS d
                FROM public.users u LEFT JOIN (SELECT user_id, count(*) total FROM public.picks GROUP BY user_id) a ON a.user_id=u.id
            ) x WHERE d <> 0),
            'success_picks_drift_users', (SELECT count(*) FROM (
                SELECT COALESCE(u.success_picks,0) - COALESCE(a.wins,0) AS d
                FROM public.users u LEFT JOIN (SELECT user_id, count(*) FILTER (WHERE status='win') wins FROM public.picks GROUP BY user_id) a ON a.user_id=u.id
            ) x WHERE d <> 0),
            'max_total_drift', (SELECT COALESCE(max(abs(COALESCE(u.total_picks,0)-COALESCE(a.total,0))),0)
                FROM public.users u LEFT JOIN (SELECT user_id, count(*) total FROM public.picks GROUP BY user_id) a ON a.user_id=u.id),
            'max_success_drift', (SELECT COALESCE(max(abs(COALESCE(u.success_picks,0)-COALESCE(a.wins,0))),0)
                FROM public.users u LEFT JOIN (SELECT user_id, count(*) FILTER (WHERE status='win') wins FROM public.picks GROUP BY user_id) a ON a.user_id=u.id)
        ),

        -- 7) 리캡 계산 불가 picks: win/lose 인데 bet_cost 또는 settled_payout NULL
        'recap_uncomputable_picks', jsonb_build_object(
            'count', (SELECT count(*) FROM public.picks WHERE status IN ('win','lose') AND (bet_cost IS NULL OR settled_payout IS NULL)),
            'bet_cost_null', (SELECT count(*) FROM public.picks WHERE status IN ('win','lose') AND bet_cost IS NULL),
            'settled_payout_null', (SELECT count(*) FROM public.picks WHERE status IN ('win','lose') AND settled_payout IS NULL),
            'by_status', COALESCE((SELECT jsonb_object_agg(status, c)
                FROM (SELECT status, count(*) c FROM public.picks WHERE status IN ('win','lose') AND (bet_cost IS NULL OR settled_payout IS NULL) GROUP BY status) s), '{}'::jsonb),
            'samples', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('fight_id', fight_id))
                FROM (SELECT fight_id FROM public.picks WHERE status IN ('win','lose') AND (bet_cost IS NULL OR settled_payout IS NULL) ORDER BY fight_id LIMIT 10) s
            ), '[]'::jsonb)
        )
    );
END;
$$;

ALTER FUNCTION public.admin_integrity_report() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_integrity_report() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_integrity_report() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_integrity_report() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_integrity_report() TO service_role;
